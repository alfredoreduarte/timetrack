import React from "react";
import { SvgXml } from "react-native-svg";

interface CaptchaSvgProps {
  svgString: string;
  width?: number;
  height?: number;
}

export const CaptchaSvg = ({
  svgString,
  width = 200,
  height = 60,
}: CaptchaSvgProps) => {
  if (!svgString) return null;
  return <SvgXml xml={svgString} width={width} height={height} />;
};
