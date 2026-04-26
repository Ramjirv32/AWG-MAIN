#include <Arduino.h>
#include "statemachine.h" 
uint32_t g_freeze_start_ms       = 0;
uint32_t g_rgb_wet_start_ms      = 0;
uint16_t g_timer_freeze   = 0;
uint16_t g_timer_rgb      = 0;
int check_ice_detection() {
    if (g_cbuf_count < 2) return 0;
    const struct SensorReading* prev = cbuf_get(1);
    bool hum_high = g_sensor_valid.humidity > 70;
    bool flow_decreasing = g_sensor_valid.flow < prev->flow && (prev->flow - g_sensor_valid.flow) > 0.5f;
    bool temp_stable = fabsf(g_sensor_valid.temp - prev->temp) < 2.0f;
    if (hum_high && flow_decreasing && temp_stable) {
        static int ice_detection_count = 0;
        ice_detection_count++;
        if (ice_detection_count >= 5) {
            Serial.println("[ALERT] ICE DETECTED → STOP PELTIER, HEATER ON");
            return 1;
        }
    }
    return 0;
}
int check_temp_drop() {
    if (g_cbuf_count >= 2) {
        const struct SensorReading* prev = cbuf_get(1);
        float drop = prev->temp - g_sensor_valid.temp;
        if (drop >= 5.0f) {
            Serial.printf("[ALERT] RAPID TEMP DROP %.1f°C\n", drop);
            return 1;
        }
    }
    return 0;
}
int check_instant_freeze() {
    if (is_startup_phase()) return 0;
    if (g_sensor_valid.temp <= -2.0f || check_temp_drop() || check_ice_detection()) {
        Serial.println("[CRITICAL] INSTANT FREEZE DETECTED (Layer 1)");
        return 1;
    }
    return 0;
}
int check_freeze() {
    if (is_startup_phase()) return 0;
    uint32_t now = millis();
    bool slow_trigger = (g_sensor_valid.temp <= 0.0f) || 
                         (g_sensor_valid.rgb_state == 1) || 
                         (g_tf.flow_delta < -0.2f && g_sensor_valid.flow < 2.0f);
    if (slow_trigger) {
        if (g_freeze_start_ms == 0) g_freeze_start_ms = now;
        uint32_t elapsed = now - g_freeze_start_ms;
        g_timer_freeze = (int)(elapsed / LOOP_DELAY_MS);
        if (elapsed >= 600000) return 1;
    } else {
        g_freeze_start_ms = 0;
        g_timer_freeze    = 0;
    }
    return 0;
}
int check_rgb_wet() {
    uint32_t now = millis();
    if (g_sensor_valid.rgb_state == 1) {
        if (g_rgb_wet_start_ms == 0) g_rgb_wet_start_ms = now;
        uint32_t elapsed_ms = now - g_rgb_wet_start_ms;
        g_timer_rgb = (int)(elapsed_ms / LOOP_DELAY_MS);
        if (elapsed_ms >= 3600000) return 2; 
        else if (elapsed_ms >= 900000) return 1; 
    } else {
        g_rgb_wet_start_ms = 0;
        g_timer_rgb        = 0;
    }
    return 0;
}
