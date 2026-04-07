"use client";

import { useParams } from "next/navigation";
import { useState, useEffect } from "react";
import EmployeeForm from "@/app/(dashboard)/employees/EmployeeForm";

function looksLikeObjectId(s: string) {
  return /^[a-f\d]{24}$/i.test(s);
}

export default function EditEmployeePage() {
  const params = useParams();
  const slug = params.slug as string;

  const [resolvedId, setResolvedId] = useState<string | null>(
    looksLikeObjectId(slug) ? slug : null,
  );

  useEffect(() => {
    if (resolvedId) return;
    fetch(`/api/employees/resolve?username=${encodeURIComponent(slug)}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?._id) setResolvedId(d._id); });
  }, [slug, resolvedId]);

  if (!resolvedId) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="shimmer h-8 w-48 rounded-lg" />
      </div>
    );
  }

  return <EmployeeForm employeeId={resolvedId} />;
}
