interface RfcMarkdownMissingProps {
  attempts: string[];
  githubUrl: string;
}

export function RfcMarkdownMissing({
  attempts,
  githubUrl,
}: RfcMarkdownMissingProps) {
  return (
    <div className="rounded-md border border-gray-20 bg-surface px-4 py-6 text-sm text-gray-70">
      <p className="font-medium text-foreground">
        No RFC Markdown file detected.
      </p>
      <p className="mt-3 text-foreground">Here&apos;s what I&apos;ve tried:</p>
      <ul className="mt-2 list-disc space-y-1.5 pl-5">
        {attempts.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ul>
      <p className="mt-4">
        <a
          href={githubUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-cyan underline-offset-2 hover:underline"
        >
          View this pull request on GitHub
        </a>
      </p>
    </div>
  );
}
