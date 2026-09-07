import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { StatusDot } from "@/components/terminal";
import { STATUS_NO_PAINEL, statusTone } from "@/lib/session-display";

/*
 * O lado do painel da SPEC-20260906-1932-kiro-aguardando-usuario-visivel.
 *
 * Renderização de verdade, não busca de texto no fonte — mesma razão de
 * `onboarding-ui.test.tsx`: `react-dom/server` já é dependência e produz a
 * árvore final, com o marcador e as classes que decidem o que a pessoa vê.
 *
 * O que NÃO dá para provar aqui é a consulta batendo no Supabase sob RLS com um
 * usuário logado — isso é o navegador do dono do painel. Por isso o filtro da
 * lista virou uma constante exportada: o que este arquivo prova é que `waiting`
 * está nela, e a consulta usa exatamente ela.
 */

describe("sessão esperando o usuário no painel", () => {
  test("waiting está entre os estados que a lista busca; idle e unknown não", () => {
    expect([...STATUS_NO_PAINEL]).toContain("waiting");
    expect([...STATUS_NO_PAINEL]).toContain("active");
    // A DEC-20260904-1443 continua de pé: a inclusão é DESSE estado, não um
    // afrouxamento do filtro.
    expect([...STATUS_NO_PAINEL]).not.toContain("idle");
    expect([...STATUS_NO_PAINEL]).not.toContain("unknown");
    expect([...STATUS_NO_PAINEL]).not.toContain("finished");
  });

  test("waiting tem marcador e cor próprios, distintos de active e de finished", () => {
    const waiting = renderToStaticMarkup(<StatusDot status="waiting" />);
    const active = renderToStaticMarkup(<StatusDot status="active" />);
    const finished = renderToStaticMarkup(<StatusDot status="finished" />);

    // Não pode cair no genérico "⏺" nem na cor apagada de estado sem destaque:
    // era assim que a sessão que precisa da pessoa passava despercebida.
    expect(waiting).toContain("text-destructive");
    expect(waiting).not.toContain("text-muted-foreground");
    expect(waiting).not.toContain("⏺");
    expect(waiting).toContain('title="waiting"');

    expect(waiting).not.toBe(active);
    expect(waiting).not.toBe(finished);
  });

  test("a palavra do estado ganha destaque em waiting, e mais que em active", () => {
    expect(statusTone("waiting")).toBe("text-destructive");
    expect(statusTone("active")).toBe("text-primary");
    // Estados que não pedem nada da pessoa seguem sem destaque.
    expect(statusTone("idle")).toBe("");
    expect(statusTone("finished")).toBe("");
    expect(statusTone("unknown")).toBe("");
  });
});
