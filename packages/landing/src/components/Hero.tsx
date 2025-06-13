import React from "react";
import matter from "gray-matter";
import ReactMarkdown from "react-markdown";
import heroMd from "../../content/hero.md?raw";
import "./hero.css";

const { data } = matter(heroMd);
const title = (data.title as string) || "Trackr";
const subtitle = (data.subtitle as string) || "";
const downloadLabel = (data.downloadLabel as string) || "Download";
const learnMoreLabel = (data.learnMoreLabel as string) || "Learn More";

const Hero: React.FC = () => {
  return (
    <header className="min-h-screen flex flex-col justify-center px-6 md:px-16 relative overflow-hidden">
      {/* Grid background overlay handled in global CSS */}
      <img
        src="/trackricon.png"
        alt="Trackr logo"
        className="w-14 h-14 md:w-16 md:h-16 mb-8 select-none"
        draggable={false}
      />
      <h1
        className="text-[clamp(3rem,8vw,8rem)] leading-none font-extrabold uppercase glitch text-neon-purple"
        data-text={title.toUpperCase()}
      >
        {title.toUpperCase()}
      </h1>
      <div className="mt-6 max-w-xl text-xl md:text-2xl leading-snug font-mono tracking-wide">
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <ReactMarkdown
          components={{
            p: ({ children }: any) => <p className="inline">{children}</p>,
          }}
        >
          {subtitle}
        </ReactMarkdown>
      </div>
      <div className="mt-10 flex gap-6">
        <a
          href="#download"
          className="inline-block bg-neon-purple px-8 py-3 rounded-md font-semibold shadow-neon text-white hover:scale-105 transition-transform"
        >
          {downloadLabel}
        </a>
        <a
          href="#features"
          className="inline-block border border-neon-purple px-8 py-3 rounded-md font-semibold text-neon-purple hover:bg-neon-purple hover:text-white transition-colors"
        >
          {learnMoreLabel}
        </a>
      </div>
    </header>
  );
};

export default Hero;
