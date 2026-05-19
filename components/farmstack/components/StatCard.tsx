interface StatCardProps {
  label: string
  value: string
  trend: string
}

export default function StatCard({ label, value, trend }: StatCardProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-xs font-medium uppercase text-gray-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-black">{value}</p>
      <p className="mt-2 text-xs text-gray-600">{trend}</p>
    </div>
  )
}
