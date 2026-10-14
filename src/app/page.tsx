import Link from "next/link";

export default function HomePage() {
  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold">Demain</h1>
      <nav aria-label="Main" className="mt-4">
        <Link
          href="/accounts"
          className="underline"
        >
          Accounts
        </Link>
      </nav>
    </main>
  );
}
