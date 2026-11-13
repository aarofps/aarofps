"use client";
import { useRouter } from "next/navigation";

export function IgnoreButton({ itemKey }: { itemKey: string }) {
  const router = useRouter();
  return (
    <button className="text-xs text-muted hover:text-text" onClick={async () => {
      await fetch("/api/recurring/ignore", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: itemKey }) });
      router.refresh();
    }}>Not recurring</button>
  );
}
