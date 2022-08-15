const inquirer = require("inquirer");
const puppeteer = require("puppeteer");
const path = require("path");
const readline = require("readline");
const fs = require("fs");

function askQuestion(query, readline) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans);
    })
  );
}

async function askTask() {
  console.clear();
  const { decision } = await inquirer.prompt([
    {
      message: "Please select the Task",
      type: "list",
      name: "decision",
      default: { name: "Game Description", value: 0 },
      choices: [
        { name: "Game Description", value: 0 },
        { name: "MT - Papago", value: 1 },
        { name: "MT - Google", value: 2 },
      ],
    },
  ]);

  return decision;
}

async function askTitle() {
  const { title } = await inquirer.prompt([
    {
      type: "input",
      name: "title",
      message: "What title do you want?",
    },
  ]);

  return title;
}

async function launchBrowser() {
  const browser = await puppeteer.launch({
    executablePath:
      typeof process.pkg === "undefined"
        ? path.join(__dirname, "assets/chrome-win/chrome")
        : "./chromium/chrome",
  });

  const page = await browser.newPage();

  return { browser, page };
}

async function extractGameDesc() {
  const gameTitle = await askTitle();

  console.clear();
  let idx = 1;
  const intervalId = setInterval(() => {
    console.clear();
    console.log(`Searching${".".repeat(idx)}`);
    idx = idx === 3 ? 1 : idx + 1;
  }, 500);

  const { browser, page } = await launchBrowser();

  await page.goto(
    `https://store.steampowered.com/search/?term=${gameTitle.toLowerCase()}`
  );

  const resultList = await page.$("#search_resultsRows");

  const links = await resultList.evaluate((el) => {
    const children = el.children;

    const links = [];
    for (const child of children) {
      const link = child.getAttribute("href");
      const title = child.querySelector(".title").textContent;
      links.push([title, link]);
    }

    return links;
  });

  clearInterval(intervalId);
  console.clear();

  const { title_choice } = await inquirer.prompt([
    {
      type: "list",
      name: "title_choice",
      message: "Choose the correct title",
      choices: links
        .map((linkMap) => ({ name: linkMap[0], value: linkMap }))
        .filter((_, idx, __) => idx < 5),
      default: { name: links[0][0], value: links[0] },
    },
  ]);

  console.clear();
  console.log(`Loading Game Description for "${title_choice[0]}"`);
  await page.goto(title_choice[1]);
  const desc = await page.$eval("#game_area_description", (el) => {
    return el.innerText.replace(/\n+/g, "\n");
  });
  await browser.close();

  console.clear();
  console.log(`Description:\n\n${desc}`);
}

async function loadSource() {
  const { srcPath } = await inquirer.prompt([
    {
      type: "input",
      message: "Please specify the Source File Path:",
      name: "srcPath",
    },
  ]);

  let source = null;
  try {
    source = fs.readFileSync(srcPath, { encoding: "utf8" }).split("\n");
  } catch (error) {
    console.error("Invalid File Path");
  }

  // const source = [
  //   "Hi",
  //   `The narrator of The Great Gatsby is a young man from Minnesota named Nick Carraway. He not only narrates the story but casts himself as the book’s author. He begins by commenting on himself, stating that he learned from his father to reserve judgment about other people, because if he holds them up to his own moral standards, he will misunderstand them. He characterizes himself as both highly moral and highly tolerant. He briefly mentions the hero of his story, Gatsby, saying that Gatsby represented everything he scorns, but that he exempts Gatsby completely from his usual judgments. Gatsby’s personality was nothing short of “gorgeous.”`,
  //   `In the summer of 1922, Nick writes, he had just arrived in New York, where he moved to work in the bond business, and rented a house on a part of Long Island called West Egg. Unlike the conservative, aristocratic East Egg, West Egg is home to the “new rich,” those who, having made their fortunes recently, have neither the social connections nor the refinement to move among the East Egg set. West Egg is characterized by lavish displays of wealth and garish poor taste. Nick’s comparatively modest West Egg house is next door to Gatsby’s mansion, a sprawling Gothic monstrosity.`,
  // ];

  return source;
}

async function translateWithPapago(page, text) {
  await page.goto(`https://papago.naver.com`, { waitUntil: "networkidle0" });

  // Select input
  const srcInput = await page.$("#txtSource");

  //   Clear input
  // console.log("Clearing input...");
  await srcInput.click({ clickCount: 3 });
  await srcInput.press("Backspace");

  //   Type text
  // console.log("Entering input...");
  await srcInput.type(text);

  // console.log("Waiting for response...");
  await page.waitForResponse(async (res) =>
    res.url().includes("translate")
      ? (await res.json()).dict !== undefined
      : false
  );

  // Extract result
  const element = await page.$("#txtTarget>span");
  const translation = await element.evaluate((el) => el.textContent);

  return translation;
}

async function translateWithGoogle(page, text) {
  await page.goto(
    `https://translate.google.com/?sl=auto&tl=ko&text=${text}&op=translate`,
    { waitUntil: "networkidle0" }
  );
  await page.waitForSelector(".VIiyi");
  await page.waitForSelector(`[aria-live="polite"]`);
  const result = await page.evaluate(() => {
    const list = document.getElementsByClassName("Q4iAWc");
    let text = "";
    for (const line of list) {
      text += line.textContent + " ";
    }
    return text.trim();
  });

  return result;
}

async function extractMTPapago() {
  const source = await loadSource();
  const { browser, page } = await launchBrowser();

  for (const [index, src] of source.entries()) {
    console.log(`[Translating ${index + 1}/${source.length}]`);
    const text = await translateWithPapago(page, src);
    console.log(text + "\n");
  }
  await browser.close();
}

async function extractMTGoogle() {
  const source = await loadSource();
  const { browser, page } = await launchBrowser();

  for (const [index, src] of source.entries()) {
    console.log(`[Translating ${index + 1}/${source.length}]`);
    const text = await translateWithGoogle(page, src);
    console.log(text + "\n");
  }

  await browser.close();
}

async function run() {
  const task = await askTask();

  switch (task) {
    case 0:
      await extractGameDesc();
      break;

    case 1:
      await extractMTPapago();
      break;

    case 2:
      await extractMTGoogle();
      break;

    default: {
      console.log("Invalid Task. Exiting...");
      return;
    }
  }
  await askQuestion("\nPress enter to quit...", readline);
  console.clear();
}

run();
