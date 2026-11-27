import React from "react";

/** The frame of a text page (legal, support, 404): logo link home, then content. */
const Page: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <main className="px-6 md:px-16 py-12 md:py-16">
    <a href="/" className="inline-flex items-center gap-3 text-gray-300 hover:text-white mb-10">
      <img src="/trackricon.png" alt="" className="w-8 h-8" draggable={false} />
      <span>← Home</span>
    </a>
    <article className="max-w-3xl">
      <h1 className="text-3xl md:text-4xl font-bold mb-6 italic underline decoration-neon-purple underline-offset-8">
        {title}
      </h1>
      {children}
    </article>
  </main>
);

export default Page;
