import csv
import random
from datetime import datetime, timedelta

# Generate 4-mode AWG training data (IDLE, NORMAL, HIGH, REGEN)
random.seed(42)
data = []

# Mode 0 (IDLE) - humidity < 30%
for i in range(1375):
    temp = random.uniform(15, 40)
    humidity = random.uniform(10, 30)
    battery = random.uniform(50, 100)
    tds = random.uniform(100, 300)
    water_level = random.uniform(0, 100)
    mcu_temp = temp + random.uniform(5, 15)
    flow = random.uniform(0, 0.1)  # 0-0.1 ml/min
    rgb_state = 0
    target_mode = 0
    confidence = random.uniform(0.85, 1.0)
    timestamp = datetime(2026, 4, 23) + timedelta(seconds=i*10)
    data.append([temp, humidity, battery, tds, water_level, mcu_temp, flow, rgb_state, target_mode, timestamp, confidence])

# Mode 1 (NORMAL) - humidity 30-70% (merged LOW into NORMAL)
for i in range(1375):
    temp = random.uniform(20, 42)
    humidity = random.uniform(30, 70)
    battery = random.uniform(50, 100)
    tds = random.uniform(200, 450)
    water_level = random.uniform(10, 90)
    mcu_temp = temp + random.uniform(5, 18)
    flow = random.uniform(0.1, 0.5)  # 0.1-0.5 ml/min
    rgb_state = 0
    target_mode = 1
    confidence = random.uniform(0.85, 1.0)
    timestamp = datetime(2026, 4, 23) + timedelta(seconds=(1375+i)*10)
    data.append([temp, humidity, battery, tds, water_level, mcu_temp, flow, rgb_state, target_mode, timestamp, confidence])

# Mode 2 (HIGH) - humidity > 70%
for i in range(1375):
    temp = random.uniform(20, 38)
    humidity = random.uniform(70, 90)
    battery = random.uniform(50, 100)
    tds = random.uniform(200, 500)
    water_level = random.uniform(30, 70)
    mcu_temp = temp + random.uniform(10, 20)
    flow = random.uniform(0.5, 1.5)  # 0.5-1.5 ml/min
    rgb_state = 0
    target_mode = 2
    confidence = random.uniform(0.85, 1.0)
    timestamp = datetime(2026, 4, 23) + timedelta(seconds=(2750+i)*10)
    data.append([temp, humidity, battery, tds, water_level, mcu_temp, flow, rgb_state, target_mode, timestamp, confidence])

# Mode 3 (REGEN) - rgb_state=1
for i in range(1375):
    temp = random.uniform(20, 38)
    humidity = random.uniform(60, 90)
    battery = random.uniform(50, 100)
    tds = random.uniform(200, 500)
    water_level = random.uniform(0, 100)
    mcu_temp = temp + random.uniform(5, 15)
    flow = random.uniform(0, 0.1)  # 0-0.1 ml/min
    rgb_state = 1
    target_mode = 3
    confidence = random.uniform(0.85, 1.0)
    timestamp = datetime(2026, 4, 23) + timedelta(seconds=(4125+i)*10)
    data.append([temp, humidity, battery, tds, water_level, mcu_temp, flow, rgb_state, target_mode, timestamp, confidence])

# Save to CSV
with open('realml_4mode.csv', 'w', newline='') as f:
    writer = csv.writer(f)
    writer.writerow(['temp', 'humidity', 'battery', 'tds', 'water_level', 'mcu_temp', 'flow', 'rgb_state', 'target_mode', 'timestamp', 'confidence_human'])
    for row in data:
        writer.writerow(row)

print(f"Generated {len(data)} 4-mode training samples")

# Count modes
mode_counts = {0: 0, 1: 0, 2: 0, 3: 0}
flow_ranges = {0: [], 1: [], 2: [], 3: []}
for row in data:
    mode = int(row[8])
    mode_counts[mode] += 1
    flow_ranges[mode].append(row[6])

print("\nMode distribution:")
for mode in range(4):
    print(f"Mode {mode}: {mode_counts[mode]} samples")

print("\nFlow ranges per mode (ml/min):")
for mode in range(4):
    flows = flow_ranges[mode]
    print(f"Mode {mode}: {min(flows):.3f} - {max(flows):.3f} (avg: {sum(flows)/len(flows):.3f})")
