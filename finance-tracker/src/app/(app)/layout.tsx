import { Nav } from "@/components/Nav";
import { logoutAction } from "../(auth)/actions";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-6xl flex-col md:flex-row">
      <aside className="border-b border-border p-3 md:w-52 md:shrink-0 md:border-b-0 md:border-r md:p-4">
        <div className="mb-3 hidden px-3 text-lg font-semibold md:block">Ledger</div>
        <Nav />
        <form action={logoutAction} className="mt-6 hidden px-3 md:block">
          <button className="text-sm text-muted hover:text-text">Lock</button>
        </form>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
