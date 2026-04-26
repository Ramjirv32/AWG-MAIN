import pandas as pd
import numpy as np
from datetime import datetime, timedelta

# Generate 4-mode AWG training data (IDLE, NORMAL, HIGH, REGEN)
np.random.seed(42)
data = []

# Mode 0 (IDLE) - humidity < 30%
for i in range(1375):  # More samples per mode for 4-mode model
    temp = np.random.uniform(15, 40)
    humidity = np.random.uniform(10, 30)
    battery = np.random.uniform(50, 100)
    tds = np.random.uniform(100, 300)
    water_level = np.random.uniform(0, 100)
    mcu_temp = temp + np.random.uniform(5, 15)
    flow = np.random.uniform(0, 0.1)  # 0-0.1 ml/min
    rgb_state = 0
    target_mode = 0
    confidence = np.random.uniform(0.85, 1.0)
    timestamp = datetime(2026, 4, 23) + timedelta(seconds=i*10)
    data.append([temp, humidity, battery, tds, water_level, mcu_temp, flow, rgb_state, target_mode, timestamp, confidence])

# Mode 1 (NORMAL) - humidity 30-70% (merged LOW into NORMAL)
for i in range(1375):
    temp = np.random.uniform(20, 42)
    humidity = np.random.uniform(30, 70)
    battery = np.random.uniform(50, 100)
    tds = np.random.uniform(200, 450)
    water_level = np.random.uniform(10, 90)
    mcu_temp = temp + np.random.uniform(5, 18)
    flow = np.random.uniform(0.1, 0.5)  # 0.1-0.5 ml/min
    rgb_state = 0
    target_mode = 1
    confidence = np.random.uniform(0.85, 1.0)
    timestamp = datetime(2026, 4, 23) + timedelta(seconds=(1375+i)*10)
    data.append([temp, humidity, battery, tds, water_level, mcu_temp, flow, rgb_state, target_mode, timestamp, confidence])

# Mode 2 (HIGH) - humidity > 70%
for i in range(1375):
    temp = np.random.uniform(20, 38)
    humidity = np.random.uniform(70, 90)
    battery = np.random.uniform(50, 100)
    tds = np.random.uniform(200, 500)
    water_level = np.random.uniform(30, 70)
    mcu_temp = temp + np.random.uniform(10, 20)
    flow = np.random.uniform(0.5, 1.5)  # 0.5-1.5 ml/min
    rgb_state = 0
    target_mode = 2
    confidence = np.random.uniform(0.85, 1.0)
    timestamp = datetime(2026, 4, 23) + timedelta(seconds=(2750+i)*10)
    data.append([temp, humidity, battery, tds, water_level, mcu_temp, flow, rgb_state, target_mode, timestamp, confidence])

# Mode 3 (REGEN) - rgb_state=1
for i in range(1375):
    temp = np.random.uniform(20, 38)
    humidity = np.random.uniform(60, 90)
    battery = np.random.uniform(50, 100)
    tds = np.random.uniform(200, 500)
    water_level = np.random.uniform(0, 100)
    mcu_temp = temp + np.random.uniform(5, 15)
    flow = np.random.uniform(0, 0.1)  # 0-0.1 ml/min
    rgb_state = 1
    target_mode = 3
    confidence = np.random.uniform(0.85, 1.0)
    timestamp = datetime(2026, 4, 23) + timedelta(seconds=(4125+i)*10)
    data.append([temp, humidity, battery, tds, water_level, mcu_temp, flow, rgb_state, target_mode, timestamp, confidence])

# Create DataFrame
df = pd.DataFrame(data, columns=['temp', 'humidity', 'battery', 'tds', 'water_level', 'mcu_temp', 'flow', 'rgb_state', 'target_mode', 'timestamp', 'confidence_human'])

# Save to CSV
df.to_csv('realml_4mode.csv', index=False)
print(f"Generated {len(df)} 4-mode training samples")
print(df['target_mode'].value_counts().sort_index())
print("\nFlow ranges per mode (ml/min):")
for mode in range(4):
    mode_data = df[df['target_mode'] == mode]
    print(f"Mode {mode}: {mode_data['flow'].min():.3f} - {mode_data['flow'].max():.3f} (avg: {mode_data['flow'].mean():.3f})")
