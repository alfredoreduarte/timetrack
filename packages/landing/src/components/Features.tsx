import React from "react";
import matter from "gray-matter";
import featuresMd from "../../content/features.md?raw";
import {
  BoltIcon,
  ChartPieIcon,
  DevicePhoneMobileIcon,
} from "@heroicons/react/24/outline";

const iconMap: Record<string, React.ElementType> = {
  DevicePhoneMobileIcon,
  BoltIcon,
  ChartPieIcon,
};

interface Feature {
  title: string;
  description: string;
  icon: React.ElementType;
}

const { data } = matter(featuresMd);

const features: Feature[] = (data.features as any[]).map((f) => ({
  title: f.title,
  description: f.description,
  icon: iconMap[f.icon] || BoltIcon,
}));

const Features: React.FC = () => {
  return (
    <section id="features" className="py-24 px-6 md:px-16 bg-deep-blue">
      <h2 className="text-3xl md:text-4xl font-bold mb-12 italic underline decoration-neon-purple underline-offset-8">
        New Features Await You
      </h2>
      <div className="grid gap-12 md:grid-cols-3">
        {features.map(({ title, description, icon: Icon }) => (
          <div key={title} className="flex flex-col items-start">
            <Icon className="w-14 h-14 text-neon-purple shadow-neon mb-6" />
            <h3 className="text-xl font-bold text-neon-green mb-2 uppercase tracking-wide">
              {title}
            </h3>
            <p className="text-base leading-relaxed text-gray-100/80 max-w-xs">
              {description}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
};

export default Features;
