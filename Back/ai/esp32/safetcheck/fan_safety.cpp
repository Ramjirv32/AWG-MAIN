#include "statemachine.h"
#define FAN_MIN_RPM 500
#define FAN_CHECK_DELAY 5000   
bool check_fan_failure() {
    if (g_fan_state > 0) {
        uint32_t now = millis();
        uint32_t fan_on_time = now - g_fan_on_start_ms;
        if (fan_on_time > FAN_CHECK_DELAY) {
            if (g_sensor_valid.rpm < FAN_MIN_RPM) {
                Serial.println(F("[SAFETY] FAN FAILURE: RPM too low!"));
                return true;
            }
        }
    }
    return false;
}
