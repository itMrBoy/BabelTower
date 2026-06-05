"use client";

import { useState } from "react";
import { EyeIcon, EyeOffIcon } from "@/components/icons";

type PasswordInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">;

export function PasswordInput({ className, ...rest }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <span className="password-field">
      <input {...rest} type={visible ? "text" : "password"} className={className} />
      <button
        type="button"
        className="password-toggle"
        tabIndex={-1}
        aria-label={visible ? "隐藏密码" : "显示密码"}
        aria-pressed={visible}
        onClick={() => setVisible((current) => !current)}
      >
        {visible ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
      </button>
    </span>
  );
}
