// Auto-generated. Do not edit.


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

declare namespace lowpowerutils {

    /**
     * Sleep. ms <= 0 means "until a wake source fires"; otherwise sleep for up to ms
     * (wake sources still wake early). Returns the wake reason.
     */
    //% shim=lowpowerutils::sleep
    function sleep(ms: int32): int32;

    /**
     * Enable or disable a button (MICROBIT_ID_BUTTON_A / _B) as a wake source.
     */
    //% shim=lowpowerutils::wakeOnButton
    function wakeOnButton(button: int32, enable: boolean): void;

    /**
     * Add (or update) a pin wake source. pinId is a DigitalPin value.
     */
    //% shim=lowpowerutils::wakeOnPin
    function wakeOnPin(pinId: int32, level: int32, pull: int32): void;

    /**
     * Remove a pin wake source.
     */
    //% shim=lowpowerutils::stopWakeOnPin
    function stopWakeOnPin(pinId: int32): void;

    /**
     * Remove all button and pin wake sources.
     */
    //% shim=lowpowerutils::clearWakeSources
    function clearWakeSources(): void;

    /**
     * Number of configured button/pin wake sources (any code, not just this extension).
     */
    //% shim=lowpowerutils::wakeSourceCount
    function wakeSourceCount(): int32;

    /**
     * Reason for the most recent wake-up (REASON_*).
     */
    //% shim=lowpowerutils::lastWakeReason
    function lastWakeReason(): int32;

    /**
     * DigitalPin id that caused the most recent wake-up, or -1.
     */
    //% shim=lowpowerutils::lastWakePin
    function lastWakePin(): int32;

    /**
     * Allow or prevent sleeping via this extension.
     */
    //% shim=lowpowerutils::setSleepAllowed
    function setSleepAllowed(allowed: boolean): void;

    /**
     * What to do if sleep is requested while BLE is connected (BLE_*).
     */
    //% shim=lowpowerutils::setBluetoothPolicy
    function setBluetoothPolicy(policy: int32): void;

    /**
     * Mark "now" as activity (feeds the sleep watchdog).
     */
    //% shim=lowpowerutils::feed
    function feed(): void;

    /**
     * Milliseconds since the last activity (feed, or wake-up).
     */
    //% shim=lowpowerutils::msSinceActivity
    function msSinceActivity(): int32;

    /**
     * Make sure the monitor component exists so wake events are raised even when
     * sleep is requested by other code.
     */
    //% shim=lowpowerutils::begin
    function begin(): void;
}

// Auto-generated. Do not edit. Really.
