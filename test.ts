// Hardware test for microbit-lowpower-utils.
// A / B and P0 (pulled up, connect to GND) wake the micro:bit.
// After 10 s with no button presses the sleep watchdog puts it to sleep.
// Also wakes every 60 s on its own (sleep for), and shows why it woke.

lowPower.wakeOnButton(WakeButton.A)
lowPower.wakeOnButton(WakeButton.B)
lowPower.wakeOnPin(DigitalPin.P0, WakeLevel.Low, PinPullMode.PullUp)

lowPower.onBeforeSleep(function () {
    basic.showIcon(IconNames.Asleep)
    basic.pause(300)
})

lowPower.onWake(function () {
    lowPower.feedSleepWatchdog()
    switch (lowPower.wakeReason()) {
        case WakeReason.ButtonA: basic.showString("A"); break
        case WakeReason.ButtonB: basic.showString("B"); break
        case WakeReason.Pin: basic.showString(lowPower.wokeByPin(DigitalPin.P0) ? "P0" : "P"); break
        case WakeReason.Timer: basic.showString("T"); break
        default: basic.showString("?"); break
    }
})

input.onButtonPressed(Button.A, function () {
    lowPower.feedSleepWatchdog()
    basic.showNumber(Math.idiv(lowPower.sleepWatchdogRemaining(), 1000))
})

input.onButtonPressed(Button.AB, function () {
    // Timed sleep: wakes after 60 s or earlier on A / B / P0
    lowPower.sleepFor(60000)
})

lowPower.setBluetoothSleepPolicy(BluetoothSleepPolicy.Disconnect)
lowPower.enableSleepWatchdog(10)
basic.showIcon(IconNames.Happy)
