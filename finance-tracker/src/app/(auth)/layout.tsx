export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh grid place-items-center px-4">
      <div className="card w-full max-w-sm p-6">{children}</div>
    </main>
  );
}
