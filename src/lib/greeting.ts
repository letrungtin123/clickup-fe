/**
 * Home greeting by local hour (WK-53). After midnight it is still night, not morning:
 * 0–4h "Khuya rồi", 4–11h morning, 11–14h noon, 14–18h afternoon, 18–24h evening.
 */
export const greetingFor = (date: Date) => {
  const hour = date.getHours();
  if (hour < 4) return "Khuya rồi";
  if (hour < 11) return "Chào buổi sáng";
  if (hour < 14) return "Chào buổi trưa";
  if (hour < 18) return "Chào buổi chiều";
  return "Chào buổi tối";
};
