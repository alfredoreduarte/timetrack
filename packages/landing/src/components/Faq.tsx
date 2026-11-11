import React from "react";
import matter from "gray-matter";
import faqMd from "../../content/faq.md?raw";

const { data } = matter(faqMd);
const questions = (data.questions as Array<{ q: string; a: string }>) || [];

const Faq: React.FC = () => (
  <section id="faq" className="py-24 px-6 md:px-16">
    <h2 className="text-3xl md:text-4xl font-bold mb-12 italic underline decoration-neon-purple underline-offset-8">
      Questions
    </h2>
    <div className="max-w-3xl space-y-4">
      {questions.map(({ q, a }) => (
        <details key={q} className="group border border-white/15 rounded-md bg-black/20 open:border-neon-purple/60">
          <summary className="cursor-pointer list-none px-5 py-4 font-bold flex justify-between gap-4">
            {q}
            <span className="text-neon-purple group-open:rotate-45 transition-transform" aria-hidden="true">
              +
            </span>
          </summary>
          <p className="px-5 pb-5 text-gray-100/80 leading-relaxed">{a}</p>
        </details>
      ))}
    </div>
  </section>
);

export default Faq;
