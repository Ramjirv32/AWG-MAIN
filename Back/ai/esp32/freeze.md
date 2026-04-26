# AWG Precise Control & Safety Logic

This system uses a prioritized decision tree based on physical sensor ground truth (RGB, Flow, Temp, Battery) to ensure maximum safety and hardware longevity.

---

## 🔝 1. Control Priority Flow
The system processes rules in the following strict order:

1. **Battery Protection**: If $<20\%$, kills all heavy loads; keeps fan at LOW for circulation.
2. **Critical Freeze**: If $T \le -2^\circ\text{C}$ or rapid drop detected $\rightarrow$ **Instant REGEN**.
3. **Ice Guard**: If $0^\circ\text{C} \ge T > -2^\circ\text{C}$ AND ice detection is confirmed $\rightarrow$ **REGEN**.
4. **Energy Save**: If $T < 5^\circ\text{C}$ and Humidity $<50\% \rightarrow$ **IDLE** (prevents ineffective cooling).
5. **Flow Analysis (3m Stability Window)**: Evaluates saturation, low humidity, or sensor failure.
6. **Normal Production**: Active production if Humidity $>50\%$ and Flow is healthy.
7. **Standby**: All other cases $\rightarrow$ **Fan-Only/IDLE**.

---

## 🧊 2. Freeze Protection (Ground Truth)
| Metric | Threshold | Action |
| :--- | :--- | :--- |
| **Instant Freeze** | $T \le -2^\circ\text{C}$ | **HEATER ON**, Motor OFF |
| **Rapid Drop** | $\Delta T > 5^\circ\text{C}$ | **HEATER ON**, Motor OFF |
| **Ice Detection** | Flow $\downarrow$ + Hum $\uparrow$ | **HEATER ON**, Motor OFF |
| **Cooling Limit** | $T \le 0^\circ\text{C}$ | Peltier OFF (prevents icing) |

---

## 🌊 3. Stable Flow Analysis (Ground Truth)
To prevent false triggers, the system monitors flow over a **3-minute stability window** ($NO\_FLOW\_TIMEOUT\_MS$).

### 🚦 The 3-Case Decision (When Flow < 0.3 LPM for 3m):
1. **🔴 Case 1: Silica Saturation**
   - *Condition:* Humidity $>60\%$ AND RGB "Wet" $>20\text{m}$.
   - *Action:* **Trigger REGEN**.
2. **🟡 Case 2: Inadequate Environment**
   - *Condition:* Humidity $<50\%$.
   - *Action:* **Stop Motor** (Saves energy; air too dry).
3. **⚠️ Case 3: Hardware Error**
   - *Condition:* RGB is "Dry" but Humidity is $>60\%$.
   - *Action:* **Sensor Failure Mode** (Safety Trip).

---

| **$<20\%$** | **Safety Standby**: Motor OFF, Heater OFF, Fan (1) only. |

---

## 🚱 5. Precision Leak Detection
The system differentiates between normal water usage and mechanical leaks using drop-rate trends and operational context.

### ⚙️ Detection logic:
- **Threshold**: Continuous drop of $>5\%$ per minute.
- **Stage 1 (60-180 sec)**: **Suspicious Window**. System flags warning but continues production.
- **Stage 2 (>180 sec)**: **Confirmation Window**.
- **Context Check**: If flow is **LOW** ($<0.3\text{ LPM}$), the drop is attributed to a leak rather than production fluctuations.

### 🚨 Action:
- Immediate **Motor STOP**.
- **Buzzer ALARM** (Active High).
- System enters Safety State (`g_mode_current = -1`).

---

## 🌡️ 6. Thermal Protection & Auto-Recovery
The system protects the MCU and Peltier drivers from overheating using a 2-stage throttling and shutdown mechanism.

| Temperature | Duration | Action | State |
| :--- | :--- | :--- | :--- |
| **$<75^\circ\text{C}$** | - | None | **NORMAL** |
| **$\ge75^\circ\text{C}$** | $>60$ sec | Heater OFF, Motor throttled to **60%** | **WARNING** |
| **$\ge85^\circ\text{C}$** | $>30$ sec | Motor throttled to **30% (MIN)** | **CRITICAL** |
| **$\ge85^\circ\text{C}$** | $>60$ sec | **Full Shutdown** (Motor/Heater OFF) | **SHUTDOWN** |
| **$\le60^\circ\text{C}$** | - | **Auto-Restart** (Safe Low Mode) | **RECOVERY** |

### 🧠 Logic Highlights:
- **Sensors Always ON**: In shutdown mode, only power-hungry components (Motor/Heater) are cut. Sensors remain active to monitor recovery.
- **Sustained Verification**: Protection only triggers if temps are sustained, avoiding trips from transient spikes.
- **Fan Cooling**: The fan remains at Level 1 during shutdown to accelerate cooling.

---

## ⚖️ Decision Tree Summary
```cpp
// 1. Freeze (Safety First)
if (temp <= -2 || rapid_drop) { heater = 1; motor = 0; }

// 2. Flow Analysis (3-minute validation)
else if (flow_fail_3min) { 
    if (saturated) regen();
    else if (dry) stop_motor();
    else sensor_error();
}

// 3. Normal production
else if (humidity > 50 && flow_ok) { motor = 1; fan = 1; }
```
