import React from "react";
import Hero, { appUrl } from "./components/Hero";
import HowItWorks from "./components/HowItWorks";
import Features from "./components/Features";
import Pricing from "./components/Pricing";
import Faq from "./components/Faq";

const App: React.FC = () => {
  return (
    <>
      <Hero />
      <HowItWorks />
      <Features />
      <Pricing />
      <Faq />
      <footer className="px-6 md:px-16 py-10 border-t border-white/10 text-sm text-gray-400 flex flex-wrap gap-6">
        <span>© Trackr</span>
        <a href={`${appUrl}/login`} className="hover:text-white">
          Log in
        </a>
        <a href="https://github.com/alfredoreduarte/timetrack" className="hover:text-white">
          GitHub
        </a>
      </footer>
    </>
  );
};

export default App;
