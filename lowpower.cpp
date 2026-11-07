/**
 * Bill Siever
 * 2026 Initial Version (prototype)
 *
 * Low power / sleep utilities for the micro:bit V2.
 *
 * Builds on CODAL's MicroBitPowerManager::deepSleep(), which:
 *   - waits until every fiber is idle,
 *   - shuts down peripherals (display, audio, radio, BLE, sensors, serial),
 *   - idles the CPU in __WFI() until a wake source fires,
 *   - restores everything and resumes the program where it stopped.
 *
 * This file adds what the Foundation "power" extension doesn't have:
 *   - any digital pin as a wake source, with level (high / low / change) and pull
 *   - wake reason reporting (button, pin, timer, other)
 *   - a wake event raised immediately after waking
 *   - Bluetooth handling: CODAL refuses to sleep while a central is connected,
 *     so we can disconnect first and re-advertise after waking
 *   - activity tracking for the sleep watchdog (implemented in lowpower.ts)
 *
 * This code is released under the [MIT License](http://opensource.org/licenses/MIT).
 * Please review the LICENSE.txt file included with this extension. If you have any questions
 * or concerns with licensing, please contact the author.
 * Distributed as-is; no warranty is given.
 */

#include "pxt.h"
#include "MicroBit.h"

using namespace pxt;

#if MICROBIT_CODAL

#define LOWPOWER_BLE (CONFIG_ENABLED(DEVICE_BLE) && CONFIG_ENABLED(MICROBIT_BLE_ENABLED))

#endif

// Event bus id / values used by this extension (must match lowpower.ts)
#define LOWPOWER_EVENT_ID       9105
#define LOWPOWER_EVT_WAKE       1

// Wake reasons (must match WakeReason in lowpower.ts)
#define REASON_NONE             0   // Didn't sleep (cancelled, refused, or too short)
#define REASON_TIMER            1
#define REASON_BUTTON_A         2
#define REASON_BUTTON_B         3
#define REASON_PIN              4
#define REASON_OTHER            5   // USB, reset-button IRQ, sensor IRQ, ...

// Wake levels (must match WakeLevel in lowpower.ts)
#define LEVEL_LOW               0
#define LEVEL_HIGH              1
#define LEVEL_CHANGE            2

// Pull modes (match core PinPullMode)
#define PULL_DOWN               0
#define PULL_UP                 1
#define PULL_NONE               2

// Bluetooth policy (must match BluetoothSleepPolicy in lowpower.ts)
#define BLE_STAY_AWAKE          0
#define BLE_DISCONNECT          1

#define MAX_WAKE_PINS           20
#define BLE_DISCONNECT_WAIT_MS  3000

namespace lowpowerutils {

#if MICROBIT_CODAL

    // ************** State **************

    struct WakePin {
        int id;         // MICROBIT_ID_IO_Px (DigitalPin value)
        int level;      // LEVEL_LOW / LEVEL_HIGH / LEVEL_CHANGE
        int pull;       // PULL_*
        int activeHi;   // Polarity actually armed for the current sleep
    };

    static WakePin wakePins[MAX_WAKE_PINS];
    static int wakePinCount = 0;
    static bool wakeA = false;
    static bool wakeB = false;

    static bool sleepAllowed = true;
    static int  blePolicy = BLE_DISCONNECT;

    static volatile int  lastReason = REASON_NONE;
    static volatile int  lastWakePinId = -1;
    static volatile int  sleepCount = 0;            // Incremented each time we actually power down
    static volatile CODAL_TIMESTAMP lastActivity = 0; // ms; updated on wake and by feed()

    // Details of the sleep currently in progress (for wake reason)
    static bool  timedSleep = false;
    static uint32_t requestedMs = 0;
    static CODAL_TIMESTAMP sleepStartMs = 0;

    // ************** Helpers **************

    // Read a pin's level directly from the GPIO port, without changing its mode.
    static int rawLevel(int name) {
#ifdef NRF_P1
        if (name >= 32)
            return (NRF_P1->IN >> (name - 32)) & 1;
#endif
        return (NRF_P0->IN >> name) & 1;
    }

    static PullMode toPullMode(int pull) {
        switch (pull) {
            case PULL_UP:   return PullMode::Up;
            case PULL_DOWN: return PullMode::Down;
            default:        return PullMode::None;
        }
    }

    static int findWakePin(int id) {
        for (int i = 0; i < wakePinCount; i++)
            if (wakePins[i].id == id) return i;
        return -1;
    }

    /*
     * Work out why we woke. Called from the deep sleep "end" callback, microseconds
     * after the CPU leaves __WFI(), so pin levels still reflect the wake trigger.
     * (The GPIO LATCH register has already been cleared by the GPIOTE IRQ handler,
     * so reading live levels is the best available signal.)
     */
    static void captureWakeReason() {
        lastWakePinId = -1;

        if (wakeA && rawLevel(uBit.io.buttonA.name) == 0) { lastReason = REASON_BUTTON_A; return; }
        if (wakeB && rawLevel(uBit.io.buttonB.name) == 0) { lastReason = REASON_BUTTON_B; return; }

        for (int i = 0; i < wakePinCount; i++) {
            MicroBitPin *p = getPin(wakePins[i].id);
            if (p && rawLevel(p->name) == wakePins[i].activeHi) {
                lastReason = REASON_PIN;
                lastWakePinId = wakePins[i].id;
                return;
            }
        }

        if (timedSleep) {
            CODAL_TIMESTAMP elapsed = system_timer_current_time() - sleepStartMs;
            // Timed wake-ups are usually up to ~20ms early (see MicroBitPowerManager)
            if (elapsed + 50 >= requestedMs) { lastReason = REASON_TIMER; return; }
        }

        lastReason = REASON_OTHER;
    }

    /**
     * A component whose only job is to be told when the device goes to sleep and wakes.
     * CodalComponent::deepSleepAll() calls every registered component, so this gives us a
     * hook that runs synchronously right after wake-up, before any user fiber resumes.
     */
    class LowPowerMonitor : public CodalComponent {
    public:
        LowPowerMonitor() : CodalComponent() {
            this->id = LOWPOWER_EVENT_ID;
        }

        virtual int deepSleepCallback(deepSleepCallbackReason reason, deepSleepCallbackData *data) override {
            switch (reason) {
                case deepSleepCallbackBegin:
                case deepSleepCallbackBeginWithWakeUps:
                    sleepCount++;
                    sleepStartMs = system_timer_current_time();
                    break;

                case deepSleepCallbackEnd:
                case deepSleepCallbackEndWithWakeUps:
                    captureWakeReason();
                    lastActivity = system_timer_current_time();
                    // Queued; handlers run in a normal fiber once the scheduler resumes.
                    Event(LOWPOWER_EVENT_ID, LOWPOWER_EVT_WAKE);
                    break;

                default:
                    break;
            }
            return DEVICE_OK;
        }
    };

    static LowPowerMonitor *monitor = NULL;

    static void init() {
        if (monitor == NULL) {
            monitor = new LowPowerMonitor();
            lastActivity = system_timer_current_time();
        }
    }

    /*
     * (Re)arm wake pins just before sleeping. User code may have changed a pin's mode
     * (e.g. an analog read), so make sure each is a digital input with the requested pull,
     * and set its polarity. "Change" wakes on the opposite of the current level.
     */
    static void armWakePins() {
        for (int i = 0; i < wakePinCount; i++) {
            MicroBitPin *p = getPin(wakePins[i].id);
            if (!p) continue;
            int now = p->getDigitalValue(toPullMode(wakePins[i].pull));
            int activeHi;
            if (wakePins[i].level == LEVEL_CHANGE)
                activeHi = now ? 0 : 1;
            else
                activeHi = wakePins[i].level == LEVEL_HIGH ? 1 : 0;
            wakePins[i].activeHi = activeHi;
            p->setPolarity(activeHi);
            p->wakeOnActive(1);
        }
        uBit.buttonA.wakeOnActive(wakeA ? 1 : 0);
        uBit.buttonB.wakeOnActive(wakeB ? 1 : 0);
    }

#if LOWPOWER_BLE
    static bool bleDisconnected = false;

    // Returns true if it's OK to sleep as far as Bluetooth is concerned.
    static bool blePrepare() {
        bleDisconnected = false;
        if (!uBit.bleManager.getConnected())
            return true;
        if (blePolicy != BLE_DISCONNECT)
            return false;

        // Stops advertising, turns off advertise-on-disconnect, and disconnects all centrals.
        uBit.bleManager.prepareForShutdown();
        bleDisconnected = true;
        for (int waited = 0; uBit.bleManager.getConnected() && waited < BLE_DISCONNECT_WAIT_MS; waited += 50)
            fiber_sleep(50);

        if (uBit.bleManager.getConnected()) {
            // Couldn't disconnect; restore normal behaviour and stay awake.
            uBit.bleManager.setAdvertiseOnDisconnect(true);
            bleDisconnected = false;
            return false;
        }
        return true;
    }

    // After waking (or a refused sleep): resume advertising so a bonded host can reconnect.
    // If we were only advertising (not connected), MicroBitBLEManager::setSleep() has
    // already restarted advertising, so there is nothing to do.
    static void bleResume() {
        if (bleDisconnected) {
            uBit.bleManager.setAdvertiseOnDisconnect(true);
            if (!uBit.bleManager.getConnected())
                uBit.bleManager.advertise();
            bleDisconnected = false;
        }
    }
#else
    static bool blePrepare() { return true; }
    static void bleResume() { }
#endif

#endif // MICROBIT_CODAL

    // ************** Exported to TypeScript (see lowpower.ts) **************

    /**
     * Sleep. ms <= 0 means "until a wake source fires"; otherwise sleep for up to ms
     * (wake sources still wake early). Returns the wake reason.
     */
    //%
    int sleep(int ms) {
#if MICROBIT_CODAL
        init();
        lastReason = REASON_NONE;
        lastWakePinId = -1;

        if (!sleepAllowed) {
            if (ms > 0) fiber_sleep(ms);
            return REASON_NONE;
        }

        if (!blePrepare()) {
            // Bluetooth connected and policy says stay awake (or disconnect failed).
            if (ms > 0) fiber_sleep(ms);
            lastActivity = system_timer_current_time();
            return REASON_NONE;
        }

        armWakePins();

        int before = sleepCount;
        timedSleep = ms > 0;
        requestedMs = ms > 0 ? ms : 0;

        if (ms > 0)
            uBit.power.deepSleep((uint32_t)ms, true /* return early if woken */);
        else
            uBit.power.deepSleep();

        if (sleepCount == before)
            lastReason = REASON_NONE;   // Never powered down (cancelled or < minimum time)

        bleResume();
        lastActivity = system_timer_current_time();
        return lastReason;
#else
        if (ms > 0) uBit.sleep(ms);
        return REASON_NONE;
#endif
    }

    /**
     * Enable or disable a button (MICROBIT_ID_BUTTON_A / _B) as a wake source.
     */
    //%
    void wakeOnButton(int button, bool enable) {
#if MICROBIT_CODAL
        if (button == MICROBIT_ID_BUTTON_A) wakeA = enable;
        else if (button == MICROBIT_ID_BUTTON_B) wakeB = enable;
        uBit.buttonA.wakeOnActive(wakeA ? 1 : 0);
        uBit.buttonB.wakeOnActive(wakeB ? 1 : 0);
#endif
    }

    /**
     * Add (or update) a pin wake source. pinId is a DigitalPin value.
     */
    //%
    void wakeOnPin(int pinId, int level, int pull) {
#if MICROBIT_CODAL
        MicroBitPin *p = getPin(pinId);
        if (!p) return;
        int i = findWakePin(pinId);
        if (i < 0) {
            if (wakePinCount >= MAX_WAKE_PINS) return;
            i = wakePinCount++;
        }
        wakePins[i].id = pinId;
        wakePins[i].level = level;
        wakePins[i].pull = pull;
        wakePins[i].activeHi = level == LEVEL_LOW ? 0 : 1;
        // Put it in digital input mode now so it's ready (CODAL only arms digital pins).
        p->getDigitalValue(toPullMode(pull));
        p->wakeOnActive(1);
#endif
    }

    /**
     * Remove a pin wake source.
     */
    //%
    void stopWakeOnPin(int pinId) {
#if MICROBIT_CODAL
        int i = findWakePin(pinId);
        if (i < 0) return;
        MicroBitPin *p = getPin(pinId);
        if (p) {
            p->wakeOnActive(0);
            p->setPolarity(1);  // Restore CODAL default (active high)
        }
        wakePins[i] = wakePins[--wakePinCount];
#endif
    }

    /**
     * Remove all button and pin wake sources.
     */
    //%
    void clearWakeSources() {
#if MICROBIT_CODAL
        while (wakePinCount > 0)
            stopWakeOnPin(wakePins[0].id);
        wakeA = wakeB = false;
        // Also clears sources set by other code (e.g. the Foundation power extension)
        CodalComponent::deepSleepAll(CodalComponent::deepSleepCallbackClearWakeUps, NULL);
#endif
    }

    /**
     * Number of configured button/pin wake sources (any code, not just this extension).
     */
    //%
    int wakeSourceCount() {
#if MICROBIT_CODAL
        CodalComponent::deepSleepCallbackData data;
        CodalComponent::deepSleepAll(CodalComponent::deepSleepCallbackCountWakeUps, &data);
        return data.count;
#else
        return 0;
#endif
    }

    /**
     * Reason for the most recent wake-up (REASON_*).
     */
    //%
    int lastWakeReason() {
#if MICROBIT_CODAL
        return lastReason;
#else
        return REASON_NONE;
#endif
    }

    /**
     * DigitalPin id that caused the most recent wake-up, or -1.
     */
    //%
    int lastWakePin() {
#if MICROBIT_CODAL
        return lastWakePinId;
#else
        return -1;
#endif
    }

    /**
     * Allow or prevent sleeping via this extension.
     */
    //%
    void setSleepAllowed(bool allowed) {
#if MICROBIT_CODAL
        sleepAllowed = allowed;
#endif
    }

    /**
     * What to do if sleep is requested while BLE is connected (BLE_*).
     */
    //%
    void setBluetoothPolicy(int policy) {
#if MICROBIT_CODAL
        blePolicy = policy;
#endif
    }

    /**
     * Mark "now" as activity (feeds the sleep watchdog).
     */
    //%
    void feed() {
#if MICROBIT_CODAL
        init();
        lastActivity = system_timer_current_time();
#endif
    }

    /**
     * Milliseconds since the last activity (feed, or wake-up).
     */
    //%
    int msSinceActivity() {
#if MICROBIT_CODAL
        init();
        return (int)(system_timer_current_time() - lastActivity);
#else
        return 0;
#endif
    }

    /**
     * Make sure the monitor component exists so wake events are raised even when
     * sleep is requested by other code.
     */
    //%
    void begin() {
#if MICROBIT_CODAL
        init();
#endif
    }

} // namespace lowpowerutils
