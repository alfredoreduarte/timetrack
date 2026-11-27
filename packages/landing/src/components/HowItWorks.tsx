import React from "react";
import matter from "gray-matter";
import howMd from "../../content/how.md?raw";

const { data } = matter(howMd);
const steps = (data.steps as Array<{ title: string; description: string }>) || [];

const HowItWorks: React.FC = () => (
  <section id="how" className="py-24 px-6 md:px-16">
    <h2 className="text-3xl md:text-4xl font-bold mb-12 italic underline decoration-neon-purple underline-offset-8">
      How it works
    </h2>
    <ol className="grid gap-10 md:grid-cols-3">
      {steps.map((s, i) => (
        <li key={s.title} className="flex flex-col">
          <span className="text-5xl font-extrabold text-neon-purple mb-4">{String(i + 1).padStart(2, "0")}</span>
          <h3 className="text-xl font-bold text-neon-green mb-2 uppercase tracking-wide">{s.title}</h3>
          <p className="text-base leading-relaxed text-gray-100/80">{s.description}</p>
        </li>
      ))}
    </ol>
  </section>
);

export default HowItWorks;
