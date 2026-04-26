# statemachine.cpp - Issues Analysis & Resolution Guide

## Critical Issues Found

### 1. ✅ CONFIRMED: Duplicate Functions with Different Logic

**Issue:** Two incompatible implementations of `check_sensor_stuck()` and `check_tds_trend()`

#### `check_sensor_stuck()` - TWO VERSIONS:
- **Version 1 (Line ~97)**: Uses circular buffer and SENSOR_STUCK_TRIGGER_MS
  ```cpp
  // Uses g_cbuf_count, g_sensor_stuck_start_ms, compares with CBUF_SIZE
  ```
- **Version 2 (Line ~576)**: Uses static local variables with tolerance 0.01f
  ```cpp
  // Uses static float last_t, last_h, last_change_ms with finer threshold
  ```
**Impact:** HIGH - Function behavior depends on which version is used. Second version overrides first.

#### `check_tds_trend()` - TWO VERSIONS:
- **Version 1 (Line ~77)**: Simple threshold check on single value
  ```cpp
  if (g_sensor_valid.tds > TDS_SHUTDOWN_LIMIT) return 2;
  if (g_sensor_valid.tds > TDS_WARN_LIMIT) return 1;
  ```
- **Version 2 (Line ~603)**: Averaging 5-sample history
  ```cpp
  // Uses g_tds_history[], g_tds_idx tracking
  ```
**Impact:** CRITICAL - Different detection strategies; one uses instantaneous value, other uses trend.

---

### 2. ✅ CONFIRMED: Hardcoded Thresholds (Non-Configurable)

**Issue:** 30+ magic numbers fixed at compile-time, no runtime configuration.

| Threshold | Location | Current Value | Use Case |
|-----------|----------|---------------|----------|
| `TDS_SHUTDOWN_LIMIT` | Line 56 | 1000.0f ppm | Water safety threshold |
| `TDS_WARN_LIMIT` | Line 57 | 500.0f ppm | Warning level |
| `SENSOR_STUCK_MS` | Line 58 | 300000 ms | 5 minutes |
| `MIN_MODE_SWITCH_MS` | Line 348 | 300000 ms | Hysteresis delay |
| `MIN_FAN_RUNTIME_MS` | Line 380 | 120000 ms | Minimum fan ON time |
| `MIN_HEATER_RUNTIME_MS` | Line 381 | 180000 ms | Minimum heater ON time |
| `MAX_HEATER_ON_MS` | Line 379 | 1800000 ms | Safety limit (30 min) |
| `FREEZE_TRIGGER_MS` | Line 200 | 100000 ms | Freeze detection delay |
| `BLOCKAGE_TRIGGER_MS` | Line 202 | 3000000 ms | 50 minutes |
| `RGB_WET_TRIGGER_MS` | Line 201 | 900000 ms | 15 minutes |
| `DRY_RUN_TIMEOUT_MS` | Line 378 | 300000 ms | 5 minutes |
| Temperature thresholds | Various | -20, 80, 85, 75, 2, 0, 5 | Multiple |
| Tank levels | Line 660-661 | 95%, 85% | Full/empty thresholds |
| Humidity thresholds | Line 639-642 | 30%, 45%, 65% | Mode switching |

**Impact:** MEDIUM - Impossible to adapt to different growing conditions without recompilation.

---

### 3. ✅ CONFIRMED: Fixed Memory Arena

**Issue:** TFLite Micro interpreter arena is fixed at 28 KB

```cpp
#define ARENA_SIZE      (28 * 1024)    // Line 54
```

**Current Model:** `awg_model.tflite` (size unknown)

**Risk Factors:**
- No dynamic allocation; fixed at compile-time
- If model grows >28 KB, `AllocateTensors()` fails
- No runtime warnings until execution
- ESP32 total heap is typically 100-300 KB

**Impact:** MEDIUM-HIGH - Silent failures if model exceeds arena; difficult to debug on device.

---

### 4. ✅ CONFIRMED: Randomized Sensor Simulation

**Issue:** `sensor_read_simulated()` uses `rand()` without proper distribution

```cpp
void sensor_read_simulated() {
    g_sensor.temp        = 20.0f + (rand() % 300 - 150) / 10.0f;
    g_sensor.humidity    = (rand() % 1000) / 10.0f;
    // ... etc
}
```

**Problems:**
1. `rand()` is not seeded (no `srand()` call visible)
2. Uniform distribution [0, RAND_MAX] converted to specific ranges can cause bias
3. No correlation between sensors (temp/humidity typically correlated in real environments)
4. No sensor drift, calibration offset, or noise models
5. Unusable for real deployment validation

**Impact:** LOW (test-mode only) but HIGH if deployed

---

### 5. ✅ CONFIRMED: Unclear Mode -1 Recovery Logic

**Issue:** "Fail-safe" mode -1 disables everything, but no recovery mechanism

```cpp
case -1: *fan_out=0; *heater_out=0; *motor_out=0; break; 
```

**Triggers for Mode -1:**
- Line 738: Silent leak detected (30-minute trend check)

**Recovery Path:** UNDEFINED
- System enters -1 silently
- No automatic recovery condition
- No manual override visible
- No timeout to attempt restart
- LED status for mode -1? (might be red LEDs, but not clear)

**Impact:** MEDIUM - System could hang indefinitely in fail-safe state after transient error.

---

## Summary Table

| Issue | Severity | Type | Lines | Fix Complexity |
|-------|----------|------|-------|-----------------|
| Duplicate `check_sensor_stuck()` | CRITICAL | Logic | 97, 576 | Medium |
| Duplicate `check_tds_trend()` | CRITICAL | Logic | 77, 603 | Medium |
| Hardcoded thresholds | MEDIUM | Config | Multiple | Low-Medium |
| Fixed ML arena | MEDIUM | Memory | 54 | Low |
| Randomized sim | MEDIUM | Test | 309+ | Low |
| Mode -1 recovery | MEDIUM | Logic | 738, 761 | Medium |

---

## Recommended Solutions

### Solution 1: Remove Duplicate Functions (CRITICAL)
- Choose ONE authoritative version of each function
- **Recommendation:**
  - Use Version 2 of `check_sensor_stuck()` (local static, tighter tolerance)
  - Use Version 2 of `check_tds_trend()` (averages 5-sample history, more robust)

### Solution 2: Extract Thresholds to Configuration Struct
```cpp
struct SystemConfig {
    float tds_shutdown_limit;
    float tds_warn_limit;
    uint32_t sensor_stuck_ms;
    uint32_t min_mode_switch_ms;
    uint32_t min_fan_runtime_ms;
    uint32_t min_heater_runtime_ms;
    uint32_t max_heater_on_ms;
    float tank_full_level;
    float tank_empty_level;
    // ... etc
};
```

### Solution 3: Dynamic Arena Sizing
```cpp
#define ARENA_SIZE_MIN      (24 * 1024)
#define ARENA_SIZE_DEFAULT  (28 * 1024)
// Check at runtime and warn if close to limits
Serial.printf("[ML] Arena usage: %d / %d bytes (%.1f%%)\n", 
              used, ARENA_SIZE, (used * 100.0f) / ARENA_SIZE);
if (used > ARENA_SIZE * 0.9f) Serial.println("[WARN] Arena near capacity!");
```

### Solution 4: Realistic Sensor Simulation
```cpp
void sensor_read_simulated() {
    static SensorModel model = {};  // state tracking
    
    // Correlated temp/humidity (psychrometric model)
    float temp_delta = (rand() % 10 - 5) * 0.1f;  // ±0.5°C
    float hum_delta = (rand() % 20 - 10) * 0.1f;  // ±1%
    
    // Gaussian-like distribution (better than uniform)
    // Could use Box-Muller or Marsaglia polar method
    
    // Include drift, noise, sensor lag
    model.apply_drift();
    model.apply_noise();
    
    g_sensor = model.read();
}
```

### Solution 5: Mode -1 Recovery Logic
```cpp
#define MODE_FAIL_SAFE_TIMEOUT_MS  (10 * 60000)  // 10 minutes
static uint32_t g_fail_safe_start_ms = 0;

if (g_mode_current == -1) {
    uint32_t now = millis();
    if (g_fail_safe_start_ms == 0) {
        g_fail_safe_start_ms = now;
        Serial.println("[FAILSAFE] Entered fail-safe mode");
    }
    
    // Attempt recovery after timeout
    if (now - g_fail_safe_start_ms > MODE_FAIL_SAFE_TIMEOUT_MS) {
        Serial.println("[FAILSAFE] Timeout reached, attempting recovery...");
        g_fail_safe_start_ms = 0;
        g_mode_current = 0;  // Reset to idle
    }
}
```

---

## Implementation Priority

1. **CRITICAL (Do First):** Remove duplicate functions → consolidate to one version each
2. **HIGH (Do Next):** Implement recovery logic for mode -1
3. **MEDIUM (Nice to Have):** Extract thresholds to config struct
4. **MEDIUM (Nice to Have):** Improve sensor simulation with drift/noise models
5. **LOW (Optional):** Dynamic arena monitoring and warnings

