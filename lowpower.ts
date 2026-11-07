/**
 * Bill Siever
 * 2026 Initial Version (prototype)
 *
 * Low power / sleep blocks for the micro:bit V2.
 * See lowpower.cpp for the native side and README.md for usage notes.
 *
 * This code is released under the [MIT License](http://opensource.org/licenses/MIT).
 */

/**
 * Why the micro:bit last woke up
 */
enum WakeReason {
    //% block="didn't sleep"
    None = 0,
    //% block="timer"
    Timer = 1,
    //% block="button A"
    ButtonA = 2,
    //% block="button B"
    ButtonB = 3,
    //% block="pin"
    Pin = 4,
    //% block="other"
    Other = 5
}

/**
 * The pin level that wakes the micro:bit
 */
enum WakeLevel {
    //% block="low"
    Low = 0,
    //% block="high"
    High = 1,
    //% block="changes"
    Change = 2
}

/**
 * Buttons that can wake the micro:bit
 */
enum WakeButton {
    //% block="A"
    A = 1,   // MICROBIT_ID_BUTTON_A
    //% block="B"
    B = 2    // MICROBIT_ID_BUTTON_B
}

/**
 * What to do if sleep is requested while a Bluetooth device is connected
 */
enum BluetoothSleepPolicy {
    //% block="disconnect and sleep"
    Disconnect = 1,
    //% block="stay awake"
    StayAwake = 0
}

/**
 * Put the micro:bit (V2) to sleep to save power, and choose what wakes it up.
 */
//% color=#4B3C8D
//% icon=""
//% block="Low Power"
//% groups='["Sleep", "Wake up", "Sleep watchdog", "Bluetooth", "Advanced"]'
namespace lowPower {

    // Must match lowpower.cpp
    const LOWPOWER_EVENT_ID = 9105;
    const LOWPOWER_EVT_WAKE = 1;

    // How often the watchdog checks for inactivity (ms)
    const WATCHDOG_POLL_MS = 200;

    //% whenUsed
    let _beforeSleepHandler: () => void = null;
    //% whenUsed
    let _watchdogTimeoutMs = 0;      // 0 = disabled
    //% whenUsed
    let _watchdogRunning = false;
    //% whenUsed
    let _simLastActivity = 0;
    //% whenUsed
    let _simLastReason = WakeReason.None;

    // ************** Native helpers (lowpower.cpp); bodies are simulator fallbacks **************

    //% shim=lowpowerutils::sleep
    function _sleep(ms: number): number {
        if (ms > 0) {
            basic.pause(ms)
            _simLastReason = WakeReason.Timer
        } else {
            _simLastReason = WakeReason.None
        }
        _simLastActivity = control.millis()
        control.raiseEvent(LOWPOWER_EVENT_ID, LOWPOWER_EVT_WAKE)
        return _simLastReason
    }

    //% shim=lowpowerutils::wakeOnButton
    function _wakeOnButton(button: number, enable: boolean): void { }

    //% shim=lowpowerutils::wakeOnPin
    function _wakeOnPin(pin: number, level: number, pull: number): void { }

    //% shim=lowpowerutils::stopWakeOnPin
    function _stopWakeOnPin(pin: number): void { }

    //% shim=lowpowerutils::clearWakeSources
    function _clearWakeSources(): void { }

    //% shim=lowpowerutils::wakeSourceCount
    function _wakeSourceCount(): number { return 0 }

    //% shim=lowpowerutils::lastWakeReason
    function _lastWakeReason(): number { return _simLastReason }

    //% shim=lowpowerutils::lastWakePin
    function _lastWakePin(): number { return -1 }

    //% shim=lowpowerutils::setSleepAllowed
    function _setSleepAllowed(allowed: boolean): void { }

    //% shim=lowpowerutils::setBluetoothPolicy
    function _setBluetoothPolicy(policy: number): void { }

    //% shim=lowpowerutils::feed
    function _feed(): void { _simLastActivity = control.millis() }

    //% shim=lowpowerutils::msSinceActivity
    function _msSinceActivity(): number { return control.millis() - _simLastActivity }

    //% shim=lowpowerutils::begin
    function _begin(): void { }

    function doSleep(ms: number): WakeReason {
        if (_beforeSleepHandler) _beforeSleepHandler()
        return _sleep(ms)
    }

    // ************** Sleep **************

    /**
     * Put the micro:bit to sleep until a wake-up source (button, pin, ...) is triggered.
     * The program pauses here and continues from this point after waking.
     * Sleep starts when all other code is idle (e.g. waiting in a pause).
     * Make sure a wake-up source is set, or only the reset button / USB will wake it.
     */
    //% block="sleep until woken"
    //% group="Sleep" weight=100
    //% parts="v2"
    export function sleep(): void {
        doSleep(0)
    }

    /**
     * Sleep for up to the given time. Wake-up sources can still wake the micro:bit early.
     * Sleeps shorter than 100 ms just pause without powering down.
     * @param ms how long to sleep, in milliseconds, eg: 5000
     */
    //% block="sleep for $ms ms"
    //% ms.shadow=timePicker
    //% group="Sleep" weight=90
    //% parts="v2"
    export function sleepFor(ms: number): void {
        doSleep(Math.max(1, ms))
    }

    /**
     * Allow or prevent sleeping. While prevented, sleep blocks (and the watchdog)
     * don't power down; a timed sleep just pauses.
     */
    //% block="allow sleep $allowed"
    //% allowed.shadow=toggleOnOff allowed.defl=true
    //% group="Sleep" weight=80
    export function allowSleep(allowed: boolean): void {
        _setSleepAllowed(allowed)
    }

    /**
     * Run code just before the micro:bit goes to sleep (e.g. save data, show an icon).
     */
    //% block="before sleep"
    //% group="Sleep" weight=70
    export function onBeforeSleep(handler: () => void): void {
        _beforeSleepHandler = handler
    }

    /**
     * Run code when the micro:bit wakes up from sleep.
     */
    //% block="on wake up"
    //% group="Sleep" weight=60
    export function onWake(handler: () => void): void {
        _begin()
        control.onEvent(LOWPOWER_EVENT_ID, LOWPOWER_EVT_WAKE, handler)
    }

    // ************** Wake up **************

    /**
     * Wake up when a button is pressed.
     * @param button the button
     * @param enable true to wake on this button
     */
    //% block="wake on button $button||$enable"
    //% enable.shadow=toggleOnOff enable.defl=true
    //% group="Wake up" weight=100
    export function wakeOnButton(button: WakeButton, enable: boolean = true): void {
        _wakeOnButton(button, enable)
    }

    /**
     * Wake up when a pin goes high, goes low, or changes.
     * "changes" wakes when the pin moves away from the level it had when sleep started.
     * Note: if the pin is already at the wake level, the micro:bit won't go to sleep.
     * @param pin the pin to watch
     * @param level the level that wakes the micro:bit
     * @param pull the pull resistor to use, eg: PinPullMode.PullNone
     */
    //% block="wake when pin $pin $level||with pull $pull"
    //% pin.fieldEditor="gridpicker" pin.fieldOptions.columns=4
    //% level.defl=WakeLevel.High
    //% group="Wake up" weight=90
    export function wakeOnPin(pin: DigitalPin, level: WakeLevel, pull: PinPullMode = PinPullMode.PullNone): void {
        _wakeOnPin(pin, level, pull)
    }

    /**
     * Stop a pin from waking the micro:bit.
     */
    //% block="stop waking on pin $pin"
    //% pin.fieldEditor="gridpicker" pin.fieldOptions.columns=4
    //% group="Wake up" weight=80
    export function stopWakeOnPin(pin: DigitalPin): void {
        _stopWakeOnPin(pin)
    }

    /**
     * Remove all button and pin wake-up sources.
     */
    //% block="clear all wake-up sources"
    //% group="Wake up" weight=70
    export function clearWakeSources(): void {
        _clearWakeSources()
    }

    /**
     * Why the micro:bit last woke up.
     */
    //% block="wake reason"
    //% group="Wake up" weight=60
    export function wakeReason(): WakeReason {
        return _lastWakeReason()
    }

    /**
     * True if the last wake-up was for the given reason.
     */
    //% block="woke up by $reason"
    //% group="Wake up" weight=55
    export function wokeBy(reason: WakeReason): boolean {
        return _lastWakeReason() == reason
    }

    /**
     * True if the last wake-up was caused by the given pin.
     */
    //% block="woke up by pin $pin"
    //% pin.fieldEditor="gridpicker" pin.fieldOptions.columns=4
    //% group="Wake up" weight=50
    export function wokeByPin(pin: DigitalPin): boolean {
        return _lastWakeReason() == WakeReason.Pin && _lastWakePin() == pin
    }

    /**
     * Number of button/pin wake-up sources currently set.
     */
    //% block="number of wake-up sources"
    //% group="Advanced" weight=10 advanced=true
    export function wakeSourceCount(): number {
        return _wakeSourceCount()
    }

    // ************** Sleep watchdog **************

    /**
     * Go to sleep automatically if the watchdog isn't fed for the given time.
     * Waking up counts as activity, so the timer restarts after each wake-up.
     * @param seconds inactivity time before sleeping, eg: 30
     */
    //% block="sleep after $seconds seconds without feeding"
    //% seconds.min=1 seconds.defl=30
    //% group="Sleep watchdog" weight=100
    export function enableSleepWatchdog(seconds: number): void {
        _watchdogTimeoutMs = Math.max(1, seconds) * 1000
        _feed()
        if (_watchdogRunning) return
        _watchdogRunning = true
        control.inBackground(function () {
            while (true) {
                basic.pause(WATCHDOG_POLL_MS)
                if (_watchdogTimeoutMs > 0 && _msSinceActivity() >= _watchdogTimeoutMs) {
                    doSleep(0)   // Resets activity on return (wake, or refused sleep)
                }
            }
        })
    }

    /**
     * Feed the sleep watchdog (restart its countdown). Call this whenever there is activity.
     */
    //% block="feed sleep watchdog"
    //% group="Sleep watchdog" weight=90
    export function feedSleepWatchdog(): void {
        _feed()
    }

    /**
     * Turn the sleep watchdog off.
     */
    //% block="turn off sleep watchdog"
    //% group="Sleep watchdog" weight=80
    export function disableSleepWatchdog(): void {
        _watchdogTimeoutMs = 0
    }

    /**
     * Milliseconds left before the watchdog puts the micro:bit to sleep (0 if off).
     */
    //% block="sleep watchdog time left (ms)"
    //% group="Sleep watchdog" weight=70
    export function sleepWatchdogRemaining(): number {
        if (_watchdogTimeoutMs <= 0) return 0
        return Math.max(0, _watchdogTimeoutMs - _msSinceActivity())
    }

    // ************** Bluetooth **************

    /**
     * Choose what happens when sleep is requested while a Bluetooth device
     * (e.g. a computer using the BLE HID blocks) is connected.
     * "disconnect and sleep" (the default) disconnects, sleeps, and starts advertising again
     * after waking so the paired device can reconnect.
     * "stay awake" skips the sleep.
     */
    //% block="set bluetooth sleep mode to $policy"
    //% group="Bluetooth" weight=100
    export function setBluetoothSleepPolicy(policy: BluetoothSleepPolicy): void {
        _setBluetoothPolicy(policy)
    }
}
