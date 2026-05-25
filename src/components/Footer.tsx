import Link from "next/link";

const SECTIONS = [
  {
    title: "Product",
    links: [
      { href: "/manifesto", label: "Manifesto" },
      { href: "/pricing", label: "Pricing" },
    ],
  },
  {
    title: "Resources",
    links: [
      { href: "https://github.com/Twixes/rfc123", label: "GitHub ↗" },
      { href: "mailto:michael@matloka.com", label: "Contact ↗" },
    ],
  },
  {
    title: "Compare",
    links: [
      { href: "/compare/google-docs", label: "vs. Google Docs" },
      { href: "/compare/notion", label: "vs. Notion" },
      { href: "/compare/markdown-prs", label: "vs. plain markdown PRs" },
      { href: "/compare/slack-canvases", label: "vs. Slack Canvases" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/terms", label: "Terms of service" },
      { href: "/privacy", label: "Privacy policy" },
    ],
  },
] as const;

const LINK_CLASS =
  "text-sm text-gray-70 transition-colors hover:text-foreground";

export default function Footer() {
  return (
    <footer className="w-full px-4 sm:px-8 pb-6">
      <nav className="grid grid-cols-2 sm:grid-cols-4 gap-8 sm:gap-12">
        {SECTIONS.map((section) => (
          <div key={section.title} className="flex flex-col">
            <h5 className="mb-3 text-sm text-foreground">{section.title}</h5>
            <ul className="space-y-2">
              {section.links.map((link) => {
                const isHttp = link.href.startsWith("http");
                const isExternal = isHttp || link.href.startsWith("mailto:");
                return (
                  <li key={link.href}>
                    {isExternal ? (
                      <a
                        href={link.href}
                        className={LINK_CLASS}
                        {...(isHttp
                          ? { target: "_blank", rel: "noopener noreferrer" }
                          : {})}
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link href={link.href} className={LINK_CLASS}>
                        {link.label}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </footer>
  );
}
