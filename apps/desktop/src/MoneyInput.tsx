import React, {
  forwardRef,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type ChangeEvent,
  type FocusEvent,
  type InputHTMLAttributes,
  type KeyboardEvent,
} from "react";
import {
  formatCentsToDecimal,
  formatCentsToDisplay,
  parseMoneyDetails,
} from "@angola/shared";

export interface MoneyInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> {
  valueCents: number;
  onChangeCents: (cents: number) => void;
  currencySuffix?: string;
  useThousandsDisplay?: boolean;
  requiredErrorMessage?: string;
}

export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(function MoneyInput(
  {
    valueCents,
    onChangeCents,
    currencySuffix,
    useThousandsDisplay = false,
    className,
    placeholder = "0,00",
    id: explicitId,
    required,
    requiredErrorMessage = "Preço obrigatório",
    onFocus,
    onBlur,
    onKeyDown,
    ...rest
  },
  forwardedRef
) {
  const inputRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(forwardedRef, () => inputRef.current as HTMLInputElement);

  const generatedId = useId();
  const inputId = explicitId || `money-input-${generatedId}`;
  const errorId = `${inputId}-error`;

  const [isFocused, setIsFocused] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [text, setText] = useState<string>(() =>
    valueCents > 0
      ? useThousandsDisplay
        ? formatCentsToDisplay(valueCents)
        : formatCentsToDecimal(valueCents)
      : ""
  );

  const prevValueCentsRef = useRef(valueCents);

  // Sincroniza o valor externo quando o campo não estiver com foco ativo
  useEffect(() => {
    if (!isFocused) {
      setText(
        valueCents > 0
          ? useThousandsDisplay
            ? formatCentsToDisplay(valueCents)
            : formatCentsToDecimal(valueCents)
          : ""
      );
      if (prevValueCentsRef.current !== valueCents) {
        prevValueCentsRef.current = valueCents;
        setErrorMessage(null);
      }
    }
  }, [valueCents, isFocused, useThousandsDisplay]);

  const handleFocus = (e: FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    setErrorMessage(null);
    if (valueCents > 0) {
      // Para edição, expõe o formato decimal sem separadores de milhares para facilitar digitação
      setText(formatCentsToDecimal(valueCents));
      // Auto-seleciona todo o conteúdo ao focar para permitir substituição imediata com a primeira tecla
      requestAnimationFrame(() => {
        inputRef.current?.select();
      });
    } else {
      // Se for zero, o campo fica visualmente vazio com placeholder "0,00"
      setText("");
    }
    onFocus?.(e);
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    // Permite digitação natural de números, vírgula e ponto sem reformatar agressivamente
    const filtered = raw.replace(/[^\d.,]/g, "");
    setText(filtered);

    if (filtered.trim() === "") {
      // Vazio durante edição com foco: estado transitório permitido
      // NUNCA chamar onChangeCents(0)! Preservar valor até confirmação
      setErrorMessage(null);
      return;
    }

    const details = parseMoneyDetails(filtered);
    if (details.valid) {
      setErrorMessage(null);
      // Vazio não é zero: apenas valores não vazios chamam onChangeCents
      if (!details.isEmpty) {
        onChangeCents(details.cents);
      }
    } else {
      setErrorMessage(details.error ?? "Valor inválido");
    }
  };

  const handleBlur = (e: FocusEvent<HTMLInputElement>) => {
    setIsFocused(false);
    const trimmed = text.trim();

    if (trimmed === "") {
      // REGRA OBRIGATÓRIA: VAZIO NÃO É ZERO
      // Quando o utilizador apaga um preço existente e sai do campo:
      // 1. NUNCA converter automaticamente para 0 cêntimos (não chamar onChangeCents(0)).
      // 2. Apresentar erro acessível "Preço obrigatório".
      // 3. Manter o estado de erro visível com aria-invalid="true".
      if (required || valueCents > 0) {
        setErrorMessage(requiredErrorMessage);
      } else {
        setErrorMessage(null);
      }
      onBlur?.(e);
      return;
    }

    const details = parseMoneyDetails(text);
    if (details.valid) {
      if (details.isExplicitZero) {
        // Entrada explícita de "0" ou "0,00": converte normalmente para zero
        setErrorMessage(null);
        onChangeCents(0);
        setText("0,00");
      } else if (!details.isEmpty) {
        setErrorMessage(null);
        onChangeCents(details.cents);
        setText(
          details.cents > 0
            ? useThousandsDisplay
              ? formatCentsToDisplay(details.cents)
              : formatCentsToDecimal(details.cents)
            : "0,00"
        );
      }
    } else {
      // Mantém a informação digitada para o utilizador corrigir e apresenta erro acessível
      setErrorMessage(details.error ?? "Valor inválido");
    }
    onBlur?.(e);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const trimmed = text.trim();
      if (trimmed === "") {
        if (required || valueCents > 0) {
          setErrorMessage(requiredErrorMessage);
        }
        return;
      }
      const details = parseMoneyDetails(text);
      if (details.valid && !details.isEmpty) {
        onChangeCents(details.cents);
      }
    }
    onKeyDown?.(e);
  };

  const displayValue = isFocused
    ? text
    : errorMessage
    ? text
    : valueCents > 0
    ? useThousandsDisplay
      ? formatCentsToDisplay(valueCents)
      : formatCentsToDecimal(valueCents)
    : "";

  const accessibleAriaLabel =
    rest["aria-label"] ??
    (!rest["aria-labelledby"] ? (rest.name || (placeholder ? `Preço (${placeholder})` : "Preço")) : undefined);

  return (
    <span className="money-input-wrapper" style={{ display: "inline-block", width: "100%" }}>
      <input
        ref={inputRef}
        id={inputId}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder={placeholder}
        required={required}
        value={displayValue}
        onFocus={handleFocus}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className={className}
        aria-label={accessibleAriaLabel}
        aria-invalid={Boolean(errorMessage)}
        aria-describedby={errorMessage ? errorId : undefined}
        {...rest}
      />
      {errorMessage && (
        <span
          id={errorId}
          role="alert"
          className="field-error-message"
          style={{ display: "block", color: "#ef4444", fontSize: "11px", marginTop: "2px" }}
        >
          {errorMessage}
        </span>
      )}
    </span>
  );
});
