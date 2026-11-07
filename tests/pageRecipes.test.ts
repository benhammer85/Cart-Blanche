import { describe, expect, test } from "vitest";
import { draftFromAi, inlineRecipeCount, mainText, photoAfterHeading, roundupLinks, siteName } from "@/lib/import/pageRecipes";

const week = `<html><head><meta property="og:site_name" content="Test Kitchen"></head><body>
<nav><a href="/category/dinner/">Dinner</a></nav>
<article><h1>A Week of Dinners</h1><div class="entry-content">
<p>Intro text.</p>
<img src="/img/gnocchi.jpg"><h2>1. Sheet Pan Gnocchi</h2>
<h3>Ingredients</h3><ul><li>1 package gnocchi</li><li>1 pound sausage</li></ul>
<h3>Instructions</h3><ol><li>Roast everything.</li></ol>
<img src="/img/tacos.png"><h2>2. Fish Tacos</h2>
<h3>Ingredients</h3><ul><li>4 fish fillets</li></ul>
<h3>Instructions</h3><ol><li>Cook the fish.</li></ol>
<h2>You May Also Like...</h2><h3><a href="/other-recipe/">Other Recipe</a></h3>
</div></article><div id="comments"><a href="/x/">x</a></div></body></html>`;

const roundup = `<html><body><header><h3><a href="/about/">About</a></h3></header>
<article><h1>25 Easy Dinners</h1>
<p>Try the <a href="https://example.com/bruschetta-chicken/">Bruschetta Chicken</a> or the
<a href="https://example.com/egg-roll-bowl/">Egg Roll Bowl</a>. Also
<a href="https://other.site/recipes/beef-tacos.html">here</a>, and <a href="https://example.com/category/dinner/">more dinners</a>.
<a href="https://www.pinterest.com/pin/1">Pin it</a></p>
<div class="entry-related"><h3><a href="https://example.com/unrelated/">Unrelated post</a></h3></div>
</article></body></html>`;

describe("pages with several recipes", () => {
  test("recipes written out on the page", () => {
    const t = mainText(week);
    expect(inlineRecipeCount(t)).toBe(2);
    expect(t).toContain("1 package gnocchi");
    expect(t).not.toContain("Dinner\n"); // nav dropped
    expect(siteName(week, "https://test.example/week/")).toBe("Test Kitchen");
  });

  test("the photo just above each recipe's heading", () => {
    expect(photoAfterHeading(week, "Fish Tacos", "https://test.example/week/")).toBe("https://test.example/img/tacos.png");
    expect(photoAfterHeading(week, "Sheet Pan Gnocchi", "https://test.example/week/")).toBe("https://test.example/img/gnocchi.jpg");
  });

  test("roundup links, without categories, social links or related posts", () => {
    const links = roundupLinks(roundup, "https://example.com/25-easy-dinners/");
    expect(links.map((l) => l.title)).toEqual(["Bruschetta Chicken", "Egg Roll Bowl", "Beef Tacos"]);
  });

  test("an AI-read recipe becomes a draft", () => {
    const d = draftFromAi({ title: "2. Fish Tacos", ingredients: ["4 panko-breaded tilapia fillets"], steps: ["Cook the fish."] }, "https://x.test/p/", "X", null);
    expect(d.title).toBe("Fish Tacos");
    expect(d.ingredients[0].qty).toBe(4);
    expect(d.mealTypes).toContain("dinner");
    expect(d.sourceName).toBe("X");
  });
});

import { pageImages } from "@/lib/import/pageRecipes";
describe("a page's photos", () => {
  test("recipe photos first, then og:image; no logos", () => {
    const html = `<head><meta property="og:image" content="https://x.test/og.jpg"><meta property="og:image" content="/logo.png">
      <script type="application/ld+json">{"@graph":[{"@type":"Recipe","name":"A","image":[{"@type":"ImageObject","url":"https://x.test/big.jpg"},"https://x.test/sq.jpg"]}]}</script></head>`;
    expect(pageImages(html, "https://x.test/r/")).toEqual(["https://x.test/big.jpg", "https://x.test/sq.jpg", "https://x.test/og.jpg"]);
  });
});
