export const formatNumber = (num: number, decimals: number = 1): string => {
  return num.toFixed(decimals);
};

export const formatPercent = (num: number): string => {
  return `${Math.round(num)}%`;
};

export const formatDecimal = (num: number): string => {
  return Number(num.toFixed(2)).toString();
};

export const formatTime = (minutes: number): string => {
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  
  if (hrs > 0) {
    return `${hrs}h ${mins}m`;
  }
  return `${mins}m`;
};

export const formatDeviceId = (id: string): string => {
  return id.replace('SIM-', '');
};

export const formatSessionId = (index: number, total: number): string => {
  return `#${String(total - index).padStart(3, '0')}`;
};
