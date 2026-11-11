import React from "react";
import matter from "gray-matter";
import ReactMarkdown from "react-markdown";
import heroMd from "../../content/hero.md?raw";
import "./hero.css";

const { data } = matter(heroMd);
const title = (data.title as string) || "Trackr";
const kicker = (data.kicker as string) || "";
const subtitle = (data.subtitle as string) || "";
const primaryLabel = (data.primaryLabel as string) || "Sign up";
const secondaryLabel = (data.secondaryLabel as string) || "Learn more";
const installCommand = (data.installCommand as string) || "";
const macLabel = (data.macLabel as string) || "Download for macOS";

export const appUrl = (import.meta.env.VITE_APP_URL || "").replace(/\/$/, "");

const Hero: React.FC = () => {
  return (
    <header className="min-h-screen flex flex-col justify-center px-6 md:px-16 py-16 relative overflow-hidden">
      <img
        src="/trackricon.png"
        alt="Trackr logo"
        className="w-14 h-14 md:w-16 md:h-16 mb-8 select-none"
        draggable={false}
      />
      <p className="text-neon-green uppercase tracking-[0.2em] text-sm md:text-base mb-4">{kicker}</p>
      <h1
        className="text-[clamp(3rem,8vw,8rem)] leading-none font-extrabold uppercase glitch text-neon-purple"
        data-text={title.toUpperCase()}
      >
        {title.toUpperCase()}
      </h1>
      <div className="mt-6 max-w-2xl text-lg md:text-2xl leading-snug font-mono tracking-wide">
        <ReactMarkdown
          components={{
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            p: ({ children }: any) => <p className="inline">{children}</p>,
          }}
        >
          {subtitle}
        </ReactMarkdown>
      </div>
      <div className="mt-10 flex flex-wrap gap-4 md:gap-6">
        <a
          href={`${appUrl}/register`}
          className="inline-block bg-neon-purple px-8 py-3 rounded-md font-semibold shadow-neon text-white hover:scale-105 transition-transform"
        >
          {primaryLabel}
        </a>
        <a
          href="#how"
          className="inline-block border border-neon-purple px-8 py-3 rounded-md font-semibold text-neon-purple hover:bg-neon-purple hover:text-white transition-colors"
        >
          {secondaryLabel}
        </a>
      </div>
      {installCommand && (
        <pre className="mt-10 max-w-full overflow-x-auto text-sm md:text-base bg-black/40 border border-neon-purple/40 rounded-md px-4 py-3 text-neon-green">
          <code>$ {installCommand}</code>
        </pre>
      )}
      <a href="/TimeTrack.zip" download className="mt-6 text-sm text-gray-300 underline underline-offset-4 hover:text-white w-fit">
        {macLabel}
      </a>
    </header>
  );
};

export default Hero;
