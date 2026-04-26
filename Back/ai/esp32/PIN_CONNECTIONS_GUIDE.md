# ESP32 AWG System - PIN CONNECTIONS GUIDE

## 1. 🌡️ SENSOR PINS
| Component | Pin | Description | Wiring |
|-----------|-----|-------------|--------|
| **DHT11** | **GPIO 4** | Temp & Humidity | DATA -> Pin 4, VCC -> 3.3V, GND -> GND |
| **TDS** | **GPIO 34** | Water Purity | ANALOG -> Pin 34, VCC -> 3.3V, GND -> GND |
| **Flow** | **GPIO 35** | Water Flow | PULSE -> Pin 35, VCC -> 5V, GND -> GND |

---

## 2. 💡 LED DASHBOARD
Connect each LED's positive leg to the GPIO pin and the negative leg to GND via a **220Ω resistor**.

| Component | Pin | Color | State Indicator |
|-----------|-----|-------|-----------------|
| **LED RED** | **GPIO 2** | 🔴 Red | System Error / Safety Trip (Mode -1) |
| **LED GREEN**| **GPIO 12**| 🟢 Green | Active Production (Modes 1, 2, 3) |
| **LED WHITE**| **GPIO 14**| ⚪ White | System Power OK / Idle (Mode 0) |

---

## 3. 🕹️ MANUAL BUTTONS
Connect buttons between the GPIO pin and **GND** (Logic uses `INPUT_PULLUP`).

| Component | Pin | Action | Serial Log Output |
|-----------|-----|--------|-------------------|
| **BTN HEATER** | **GPIO 18**| Toggle Heater | `[BTN] Heater manually toggled: ON/OFF` |
| **BTN MODE** | **GPIO 19**| Cycle Fan Speed | `[BTN] Fan: Low Speed` ... `[BTN] Fan: OFF` |

---

## 4. ⚙️ ACTUATORS (PWM)
| Component | Pin | Type | Logic |
|-----------|-----|------|-------|
| **Fan** | **GPIO 25** | PWM | 0 (OFF) -> 120 (LOW) -> 180 (MID) -> 255 (MAX) |
| **Heater** | **GPIO 26** | PWM | 0 (OFF) -> 255 (ON) |
| **Motor** | **GPIO 27** | PWM | 0 (OFF) -> 255 (ON) |

---

## 🔌 WIRING CHECKLIST
- [ ] DHT11 Data line has a 4.7kΩ pull-up to 3.3V.
- [ ] TDS sensor is powered by 3.3V for correct ADC scaling.
- [ ] Flow sensor is powered by 5V (but pulse is read safely by ESP32).
- [ ] LEDs have 220Ω series resistors to prevent burnout.
- [ ] GND is common between all sensors and actuators.

**Last Updated:** April 24, 2026
**Firmware Version:** 4.0 - Manual Overrides Integration
