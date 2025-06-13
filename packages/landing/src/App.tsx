import React from "react";
import Hero from "./components/Hero";
import Features from "./components/Features";

const App: React.FC = () => {
  return (
    <>
      <Hero />
      <Features />
      {/* Future sections like contact form can be added here */}
    </>
  );
};

export default App;
