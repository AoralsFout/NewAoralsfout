/** 联系方式配置：导出站主确认的个人、工作邮箱及 GitHub 入口，允许通过 Vite 环境变量覆盖。 */
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 无效配置不生成可操作链接，避免访客跳转到错误地址。 */
function email(value: string | undefined, fallback: string): string {
  const candidate = (value ?? fallback).trim();
  return emailPattern.test(candidate) ? candidate : "";
}

function webUrl(value: string | undefined): string {
  try {
    const candidate = new URL(value ?? "https://github.com/aoralsfout");
    return (candidate.protocol === "https:" ||
      candidate.protocol === "http:") &&
      !candidate.username &&
      !candidate.password
      ? candidate.href
      : "";
  } catch {
    return "";
  }
}

export const contacts = {
  workEmail: email(import.meta.env.VITE_CONTACT_EMAIL, "aoralsfout@zyghit.cn"),
  personalEmail: email(
    import.meta.env.VITE_PERSONAL_EMAIL,
    "aoralsfout@gmail.com",
  ),
  githubUrl: webUrl(import.meta.env.VITE_CONTACT_URL),
};
