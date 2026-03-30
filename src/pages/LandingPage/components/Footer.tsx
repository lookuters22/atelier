const COLUMNS = [
  {
    title: "Product",
    links: ["Features", "Autopilot", "Pricing", "Integrations"],
  },
  {
    title: "Resources",
    links: ["Help Center", "Photographer Guides", "Community"],
  },
  {
    title: "Company",
    links: ["About Us", "Careers", "Contact"],
  },
];

function SocialIcon({ d, label }: { d: string; label: string }) {
  return (
    <a
      href="#"
      aria-label={label}
      className="transition-colors hover:text-slate-600"
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="currentColor"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d={d} />
      </svg>
    </a>
  );
}

export function Footer() {
  return (
    <footer className="bg-[#F5F5F0] px-4 pb-6 pt-12 md:px-6">
      {/* Dark Panel */}
      <div className="flex flex-col rounded-[3rem] rounded-bl-sm bg-slate-900 px-8 py-12 text-white md:px-16 md:py-14 lg:px-24">
        {/* Top Row */}
        <div className="grid grid-cols-1 items-start gap-8 md:grid-cols-4">
          <div className="col-span-1">
            <div className="inline-block rounded-full border border-white/20 px-4 py-1.5 text-2xl font-medium tracking-tight">
              atelier
            </div>
          </div>
          <div className="col-span-1 md:col-span-3">
            <h2 className="max-w-lg text-3xl font-light leading-tight tracking-tight text-white md:text-4xl">
              Atelier makes your studio autonomous.
            </h2>
          </div>
        </div>

        {/* Bottom Row — Link Columns */}
        <div className="mt-16 grid grid-cols-2 gap-12 md:mt-20 md:grid-cols-4 md:gap-8">
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h3 className="mb-6 text-sm font-medium text-white">
                {col.title}
              </h3>
              <ul className="flex flex-col gap-4 text-sm text-white/60">
                {col.links.map((link) => (
                  <li key={link}>
                    <a
                      href="#"
                      className="transition-colors hover:text-white"
                    >
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Contact Column */}
          <div>
            <h3 className="mb-6 text-sm font-medium text-white">Contact</h3>
            <p className="text-sm leading-relaxed text-white/60">
              hello@atelier-os.com
              <br />
              123 Creative Ave
              <br />
              Studio 4B
              <br />
              New York, NY 10012
            </p>
          </div>
        </div>
      </div>

      {/* Bottom Strip */}
      <div className="mt-8 flex flex-col items-center justify-between gap-6 px-4 text-sm text-slate-500 md:flex-row md:gap-0 md:px-8">
        <p>&copy; 2026 Atelier OS. All Rights Reserved.</p>

        <div className="flex items-center gap-6 text-slate-900">
          {/* TikTok */}
          <SocialIcon
            label="TikTok"
            d="M16.6 5.82s.51.49 1.55.49V8.5s-.78-.02-1.55-.37v4.25a4.62 4.62 0 1 1-4-4.58v2.22a2.4 2.4 0 1 0 1.72 2.31V2h2.22a3.59 3.59 0 0 0 .06.82Z"
          />
          {/* X / Twitter */}
          <SocialIcon
            label="X"
            d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
          />
          {/* Facebook */}
          <SocialIcon
            label="Facebook"
            d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z"
          />
          {/* LinkedIn */}
          <SocialIcon
            label="LinkedIn"
            d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.125 2.062 2.062 0 0 1 0 4.125zM6.863 20.452H3.81V9h3.054v11.452z"
          />
          {/* Instagram */}
          <SocialIcon
            label="Instagram"
            d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"
          />
        </div>
      </div>
    </footer>
  );
}
