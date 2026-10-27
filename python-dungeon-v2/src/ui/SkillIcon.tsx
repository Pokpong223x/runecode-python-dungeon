import type { ActionKind, HeroId, SkillId } from "../types";

const palettes = {
  adventurer: ["#352b29", "#d5a852"],
  knight: ["#29313b", "#e7bc72"],
  wizard: ["#362334", "#f4a15f"],
  attack: ["#223341", "#9fc7da"],
  defend: ["#183b39", "#83d6bd"],
  heal: ["#38273e", "#df9ec9"],
  focus: ["#163c55", "#68c9f3"],
  pierce: ["#183447", "#9bddec"],
  stun: ["#352e47", "#d7b2fa"],
  burst: ["#46292b", "#ffbd73"],
} as const;

function Blade() {
  return (
    <>
      <path fill="#091b24" d="M33 7h9v9L27 31h-5l-5-5v-5z" />
      <path fill="#79aebd" d="M34 10h5v5L25 29l-6-6z" />
      <path fill="#e2f4e3" d="M34 10h5v3L23 29l-4-6z" />
      <path fill="#fff8dc" d="M34 10h5v2L22 27l-2-3z" />
      <path fill="#67462e" d="m18 28 5 5-7 8-6-6z" />
      <path fill="#d9a554" d="m13 23 3-3 14 14-3 3z" />
      <path fill="#fbe3a1" d="m13 23 3-3 3 3-3 3z" />
      <path fill="#8d643a" d="m13 34 4 4-2 3-5-5z" />
    </>
  );
}

function Guard({ bash = false }: { bash?: boolean }) {
  return (
    <>
      <path
        fill="#0b1c25"
        d="M11 8h26v4h4v16h-4v7h-5v5h-5v3h-6v-3h-5v-5h-5v-7H7V12h4z"
      />
      <path
        fill={bash ? "#e0b46b" : "#95d8ce"}
        d="M13 11h22v4h3v12h-4v6h-5v5h-5v2h-2v-2h-5v-5h-4v-6h-3V15h3z"
      />
      <path
        fill={bash ? "#705639" : "#28666b"}
        d="M16 15h16v3h2v9h-4v5h-6v4h-2v-4h-5v-5h-3v-9h2z"
      />
      <path
        fill={bash ? "#ffe5a6" : "#bdf5df"}
        d={
          bash
            ? "M22 17h4v6h5v4h-5v6h-4v-6h-5v-4h5z"
            : "M24 16h7l-6 9h5L20 36l2-10h-6z"
        }
      />
      <path fill="#ffffff" opacity=".6" d="M13 13h2v12h-2z" />
      {bash && (
        <path
          fill="#ffe5a6"
          d="M2 18h4v3H2zm0 8h5v3H2zm38-10h5v3h-5zm2 8h5v3h-5z"
        />
      )}
    </>
  );
}

export function SkillIcon({
  action,
  hero,
  skill = "class",
}: {
  action: ActionKind;
  hero: HeroId;
  skill?: SkillId;
}) {
  const key = action === "skill" ? (skill === "class" ? hero : skill) : action;
  const [back, accent] = palettes[key];
  return (
    <svg
      className={`skill-art skill-art-${key}`}
      data-skill-art={key}
      viewBox="0 0 48 48"
      fill="none"
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
      <path fill="#081c25" d="M6 1h36v4h5v37h-5v5H6v-5H1V5h5z" />
      <path fill={accent} d="M7 3h34v4h4v33h-4v5H7v-5H3V7h4z" />
      <path fill={back} d="M8 5h32v4h3v30h-4v4H9v-4H5V9h3z" />
      <path
        fill={accent}
        opacity=".25"
        d="M8 7h32v2H8zm0 32h31v2H8zM7 10h2v28H7z"
      />
      {key === "adventurer" && (
        <>
          <path
            fill="#eec166"
            opacity=".35"
            d="M12 12h24v3H12zm-3 7h30v3H9zm4 7h22v3H13z"
          />
          <g transform="translate(48 0) scale(-1 1)">
            <Blade />
          </g>
          <Blade />
          <path fill="#fff0b3" d="M22 19h4v3h4v4h-4v4h-4v-4h-4v-4h4z" />
        </>
      )}
      {key === "attack" && <Blade />}
      {key === "focus" && (
        <>
          <path fill="#287bb0" d="M17 10h14v5h6v18h-6v5H17v-5h-6V15h6z" />
          <path fill="#68c9f3" d="M19 14h10v5h5v10h-5v5H19v-5h-5V19h5z" />
          <path fill="#e0f8ff" d="M22 15h4v7h7v4h-7v7h-4v-7h-7v-4h7z" />
          <path
            fill="#9de3ff"
            d="M6 7h4v4H6zm31 0h4v4h-4zM7 36h4v4H7zm30 0h4v4h-4z"
          />
        </>
      )}
      {key === "pierce" && (
        <>
          <path fill="#88ddee" d="M8 28h17v4H8zm4-8h13v4H12z" />
          <Blade />
          <path fill="#fff3bd" d="M32 6h3v8h-3zm6 8h7v3h-7z" />
        </>
      )}
      {key === "stun" && (
        <>
          <path fill="#ab8ed0" d="M13 15h22v20H13zM17 11h14v28H17z" />
          <path fill="#fff0a1" d="M25 8h9l-10 14h10L17 42l4-17h-9z" />
          <path fill="#e9d2ff" d="M7 10h4v4H7zm29 24h5v5h-5z" />
        </>
      )}
      {key === "burst" && (
        <>
          <path
            fill="#ed7048"
            d="M19 6h10v8h7v7h6v13h-7v7H13v-7H6V21h7v-7h6z"
          />
          <path fill="#ffca70" d="M20 14h8v7h7v12h-7v6h-8v-6h-7V21h7z" />
          <path fill="#fff1bb" d="M22 20h4v6h6v4h-6v6h-4v-6h-6v-4h6z" />
        </>
      )}
      {(key === "defend" || key === "knight") && (
        <Guard bash={key === "knight"} />
      )}
      {key === "wizard" && (
        <>
          <path fill="#ae4b68" d="M11 37h26v3H11zm6 5h14v2H17z" />
          <path
            fill="#f17246"
            d="M22 6h4v5h4v7h4v-4h4v7h3v11h-4v5h-6v3H17v-3h-6v-5H8V22h4v-6h4v9h4v-7h-2v-6h4z"
          />
          <path
            fill="#ffc267"
            d="M23 15h4v7h4v5h4v6h-5v4H18v-4h-4v-7h4v4h4v-9h1z"
          />
          <path fill="#fff2b3" d="M23 25h4v6h3v4H19v-5h4z" />
          <path fill="#ffd285" d="M36 7h3v3h-3zM8 11h3v3H8zm32 27h3v3h-3z" />
        </>
      )}
      {key === "heal" && (
        <>
          <path
            fill="#0c1728"
            d="M17 7h14v12h4v4h4v15h-4v4H13v-4H9V23h4v-4h4z"
          />
          <path
            fill="#dab6d7"
            d="M20 12h8v9h4v4h4v11h-4v3H16v-3h-4V25h4v-4h4z"
          />
          <path fill="#7d4b85" d="M19 24h10v3h5v9H14v-9h5z" />
          <path fill="#ed86b2" d="M14 28h20v8H14z" />
          <path fill="#fff2df" d="M22 25h4v4h4v4h-4v4h-4v-4h-4v-4h4z" />
          <path fill="#fff2df" d="M15 24h2v5h-2zm5-9h2v5h-2z" />
          <path fill="#8c6249" d="M18 7h12v6H18z" />
          <path fill="#e7bd88" d="M18 7h12v3H18z" />
        </>
      )}
      <path fill="#fff1cc" opacity=".55" d="M7 4h10v1H7z" />
    </svg>
  );
}
