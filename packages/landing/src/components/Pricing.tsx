import React from "react";
import matter from "gray-matter";
import pricingMd from "../../content/pricing.md?raw";
import { appUrl } from "./Hero";

interface Plan {
  name: string;
  price: string;
  note: string;
  highlight?: boolean;
  items: string[];
}

const { data } = matter(pricingMd);
const plans = (data.plans as Plan[]) || [];
const footnote = (data.footnote as string) || "";

const Pricing: React.FC = () => (
  <section id="pricing" className="py-24 px-6 md:px-16 bg-deep-blue">
    <h2 className="text-3xl md:text-4xl font-bold mb-12 italic underline decoration-neon-purple underline-offset-8">
      Pricing
    </h2>
    <div className="grid gap-8 md:grid-cols-2 max-w-4xl">
      {plans.map((p) => (
        <div
          key={p.name}
          className={`rounded-lg p-8 border ${p.highlight ? "border-neon-purple shadow-neon" : "border-white/20"} bg-black/30`}
        >
          <h3 className="text-xl font-bold uppercase tracking-wide text-neon-green">{p.name}</h3>
          <p className="mt-4">
            <span className="text-5xl font-extrabold">{p.price}</span>{" "}
            <span className="text-gray-300">{p.note}</span>
          </p>
          <ul className="mt-6 space-y-2 text-gray-100/90">
            {p.items.map((item) => (
              <li key={item} className="flex gap-3">
                <span className="text-neon-purple" aria-hidden="true">
                  ▸
                </span>
                {item}
              </li>
            ))}
          </ul>
          <a
            href={`${appUrl}/register`}
            className={`mt-8 inline-block px-6 py-3 rounded-md font-semibold ${
              p.highlight
                ? "bg-neon-purple text-white shadow-neon hover:scale-105 transition-transform"
                : "border border-neon-purple text-neon-purple hover:bg-neon-purple hover:text-white transition-colors"
            }`}
          >
            {p.highlight ? "Start the free trial" : "Start free"}
          </a>
        </div>
      ))}
    </div>
    {footnote && <p className="mt-8 text-sm text-gray-300 max-w-2xl">{footnote}</p>}
  </section>
);

export default Pricing;
