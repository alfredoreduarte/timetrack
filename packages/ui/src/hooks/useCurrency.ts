import { useSelector } from "react-redux";
import { RootState } from "../store";

/** The user's currency: their rates, and so every earnings figure, are in it. */
export const useCurrency = () => useSelector((state: RootState) => state.auth.user?.currency) || "USD";
