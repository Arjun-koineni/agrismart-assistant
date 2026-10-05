import rateLimit from "express-rate-limit";

export const aiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 25,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "AI request limit reached. Please try again later." },
});
