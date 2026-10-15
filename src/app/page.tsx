import Link from "next/link";

export default function HomePage() {
  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold">Demain</h1>
      <nav aria-label="Main" className="mt-4">
        <ul className="flex gap-6">
          <li>
            <Link href="/accounts" className="underline">
              Accounts
            </Link>
          </li>
          <li>
            <Link href="/transactions" className="underline">
              Transactions
            </Link>
          </li>
          <li>
            <Link href="/categories" className="underline">
              Categories
            </Link>
          </li>
          <li>
            <Link href="/synthesis" className="underline">
              Monthly synthesis
            </Link>
          </li>
        </ul>
      </nav>
    </main>
  );
}
