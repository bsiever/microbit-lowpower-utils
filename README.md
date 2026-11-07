# Low Power utilities for micro:bit (V2)

> **Prototype.** It compiles for the micro:bit V2, but has not been tested on hardware yet.

Blocks that put the micro:bit V2 to sleep to save battery and wake it up again. Your program pauses while the micro:bit sleeps and continues from the same point when it wakes.

It builds on CODAL's `MicroBitPowerManager` deep sleep (like the Micro:bit Foundation [power extension](https://github.com/microbit-foundation/pxt-microbit-v2-power)) and adds:

* **Any digital pin** as a wake-up source, waking on **high**, **low**, or **changes**, with a choice of pull resistor
* **Wake reason** (button A/B, which pin, timer, other) and an **on wake up** event
* A **sleep watchdog**: go to sleep automatically if it isn't fed for a set time
* **Bluetooth-aware sleep**: CODAL won't sleep while a Bluetooth device is connected. This extension can disconnect, sleep, and start advertising again after waking, so a paired device (e.g. a computer using the BLE HID blocks) can reconnect.

## Sleep

```blocks
lowPower.sleep()          // until a wake-up source fires
lowPower.sleepFor(60000)  // up to 60 s (wake-up sources still wake it early)
```

Sleep starts once all other code is idle (for example, waiting in a `pause`). While asleep, the display, sound, radio, Bluetooth, and sensors are off. Event handlers and `forever` loops wait until the micro:bit wakes.

* `allow sleep (on/off)`: while off, sleep requests (and the watchdog) are skipped.
* `before sleep { }`: runs just before going to sleep.
* `on wake up { }`: runs after waking.

## Wake up

```blocks
lowPower.wakeOnButton(WakeButton.A)
lowPower.wakeOnPin(DigitalPin.P0, WakeLevel.Low, PinPullMode.PullUp)   // switch from P0 to GND
lowPower.onWake(function () {
    if (lowPower.wokeByPin(DigitalPin.P0)) {
        basic.showString("P0")
    }
})
```

* Wake-up works on the **level** of a pin. If a pin is already at its wake level when sleep is requested, the micro:bit won't go to sleep. **changes** wakes when the pin moves away from the level it had when sleep started.
* The touch logo and pins used for capacitive touch can't wake the micro:bit.
* If no wake-up source is set, only the reset button or plugging in USB will wake it (a timed sleep wakes on its own).
* The wake reason is a best guess, based on pin levels read right after waking. A very short pulse on a pin may show up as **other**.

## Sleep watchdog

```blocks
lowPower.enableSleepWatchdog(30)
input.onButtonPressed(Button.A, function () {
    lowPower.feedSleepWatchdog()
})
```

The watchdog puts the micro:bit to sleep (until a wake-up source fires) if `feed sleep watchdog` isn't called for the given number of seconds. Waking up counts as feeding it.

## Bluetooth

```blocks
lowPower.setBluetoothSleepPolicy(BluetoothSleepPolicy.Disconnect)
```

* **disconnect and sleep** (default): if a device is connected, disconnect it, sleep, then advertise again after waking. Reconnecting is up to the other device: most computers and phones reconnect automatically to a paired device that is advertising.
* **stay awake**: if a device is connected, skip the sleep.

If nothing is connected, advertising stops during sleep and restarts on wake automatically.

## Notes and limits

* micro:bit **V2 only**. On a V1, `sleep for` is just a pause and `sleep until woken` does nothing.
* The micro:bit stays awake for at least 0.5 s after waking before it can sleep again. Timed sleeps shorter than 0.1 s just pause.
* This is CODAL's "deep sleep": a low power idle that keeps RAM and timekeeping. It is not the nRF52 "System OFF" mode, which would draw less but restart the program on wake.

## License

MIT

#### Metadata (used for search, rendering)

* for PXT/microbit
<script src="https://makecode.com/gh-pages-embed.js"></script><script>makeCodeRender("{{ site.makecode.home_url }}", "{{ site.github.owner_name }}/{{ site.github.repository_name }}");</script>
