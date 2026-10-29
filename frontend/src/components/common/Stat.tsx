export default function Stat({ label, value, tone }: { label: string; value: number; tone: "neutral" | "alert" }) {
  return (
    <div className={`stat${tone === "alert" ? " stat-alert" : ""}`}>
      <span>{label}</span>
      <strong>{value.toLocaleString("vi-VN")}</strong>
    </div>
  );
}
