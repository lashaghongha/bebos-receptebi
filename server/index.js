// ═══════════════════════════════════════════════════════════
//  ბებოს რეცეპტები — Backend API (Express + Postgres)
//  Railway-ზე გასაშვებად: Root Directory = server, Start = npm start
//  საჭიროა env ცვლადი DATABASE_URL (Railway Postgres ავტომატურად აძლევს).
// ═══════════════════════════════════════════════════════════
import express from "express";
import cors from "cors";
import pg from "pg";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const { Pool } = pg;
const PORT = process.env.PORT || 3000;

// CORS — თუ გინდა შეზღუდო, ჩაწერე Vercel დომენი CORS_ORIGIN ცვლადში
// მრავალი დომენი მძიმით გამოყავი. სქემა (https://) სავალდებულო არაა — ავტომატურად ემატება.
const RAW_ORIGIN = process.env.CORS_ORIGIN || "*";
const normOrigin = (o) => {
  const v = String(o).trim().replace(/\/+$/, "");
  if (!v || v === "*") return v;
  return (/^https?:\/\//i.test(v) ? v : "https://" + v).toLowerCase();
};
const ALLOW = RAW_ORIGIN.split(",").map(normOrigin).filter(Boolean);
const corsOrigin =
  ALLOW.includes("*") || !ALLOW.length
    ? "*"
    : (origin, cb) => {
        // origin არ არსებობს server-to-server/curl-ისთვის — დაუშვი
        if (!origin) return cb(null, true);
        cb(null, ALLOW.includes(normOrigin(origin)));
      };

// JWT — production-ზე აუცილებლად დააყენე ძლიერი JWT_SECRET env ცვლადი
const JWT_SECRET = process.env.JWT_SECRET || "bebo-secret-change-me";
const TOKEN_TTL = "30d";

// ADMIN — მძიმით გამოყოფილი ელფოსტების სია, ვისაც ადმინის პანელი ეხსნება
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "")
  .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
const isAdmin = (email) => !!email && ADMIN_EMAILS.includes(String(email).toLowerCase());

if (!process.env.DATABASE_URL) {
  console.error("⚠️  DATABASE_URL ცვლადი არ არის დაყენებული. Railway-ზე დაამატე Postgres plugin.");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("localhost") ? false : { rejectUnauthorized: false },
});

const app = express();
app.use(cors({ origin: corsOrigin }));
app.use(express.json({ limit: "4mb" })); // კერძის/ავატარის ფოტოები data URL-ად

// ─── row <-> app mapping (desc/time რეზერვირებულია → description/time_text) ───
const rowToRecipe = (x) => ({
  id: x.id, cook: x.cook, name: x.name, cat: x.cat, emoji: x.emoji, tb: x.tb,
  time: x.time_text, serves: x.serves, level: x.level, desc: x.description,
  ingredients: x.ingredients || [], steps: x.steps || [], tip: x.tip,
  photo: x.photo || null,
  rating_avg: x.rating_avg != null ? Number(x.rating_avg) : 0,
  rating_count: x.rating_count != null ? Number(x.rating_count) : 0,
});

// ─── seed data (პირველი გაშვებისას) ───
const P = [
  "linear-gradient(150deg,#f6d98a,#e0a94b)","linear-gradient(150deg,#c98a5a,#8a4b2a)",
  "linear-gradient(150deg,#9fbf5f,#5c7a2e)","linear-gradient(150deg,#9b6bb0,#5c3a72)",
  "linear-gradient(150deg,#e8895a,#b3472a)","linear-gradient(150deg,#6bb0a4,#2e6f6a)",
];
const SEED_COOKS = [
  { id:"nana",  name:"ბებია ნანა",  city:"აჭარა",     av:"👵",   cc:P[0] },
  { id:"medea", name:"ბებია მედეა", city:"სამეგრელო", av:"🧓",   cc:P[5] },
  { id:"eter",  name:"ბებია ეთერი", city:"კახეთი",    av:"👩‍🍳", cc:P[2] },
  { id:"lida",  name:"ბებია ლიდა",  city:"ქართლი",    av:"👵",   cc:P[3] },
];
const SEED_RECIPES = [
  { id:"khachapuri",cook:"nana",name:"აჭარული ხაჭაპური",cat:"ცომეული",emoji:"🫓",tb:P[0],time:"60 წთ",serves:"4 კაცი",level:"საშუალო",desc:"ნავის ფორმის ცხელი ხაჭაპური გამდნარი ყველით, კვერცხითა და კარაქით.",ingredients:["ფქვილი — 500 გ","თბილი წყალი — 250 მლ","საფუარი — 7 გ","შაქარი — 1 ჩ/კ","მარილი — 1 ჩ/კ","იმერული ყველი — 400 გ","სულგუნი — 200 გ","კვერცხი — 4 ცალი","კარაქი — 50 გ"],steps:["თბილ წყალში გახსენი საფუარი და შაქარი, დაასვენე 10 წუთი.","დაუმატე ფქვილი და მარილი, მოზილე ცომი, დააფარე 1 საათით.","ყველი გახეხე. ცომი გაყავი 4 ნაწილად და გააბრტყელე.","კიდეები აახვიე ნავის ფორმაზე, შუაში ჩააწყვე ყველი.","გამოაცხვე 230°C-ზე 15 წუთი, შუაში გააკეთე ჩაღრმავება.","ჩაარტყი კვერცხი, დააბრუნე 3 წუთით, დაადე კარაქი."],tip:"ჭამის წინ ჩანგლით აურიე კვერცხი, ყველი და კარაქი." },
  { id:"soko-ketsi",cook:"nana",name:"სოკო კეცზე",cat:"მთავარი კერძი",emoji:"🍄",tb:P[1],time:"30 წთ",serves:"3 კაცი",level:"მარტივი",desc:"შამპინიონი სულგუნით, კარაქითა და ქინძით — თიხის კეცზე გამომცხვარი.",ingredients:["სოკო — 500 გ","სულგუნი — 200 გ","კარაქი — 40 გ","ნიორი — 2 კბილი","ქინძი — 1/2 კონა","მარილი, პილპილი — გემოვნებით"],steps:["სოკო გაწმინდე და დაჭერი.","კეცი გააცხელე კარაქთან ერთად.","ჩააწყვე სოკო, შეწვი წვენის აორთქლებამდე.","დაუმატე ნიორი და პილპილი.","მოაყარე სულგუნი, დააფარე 3 წუთით.","მოაყარე ქინძი და მიირთვი ცხელი."],tip:"ტყის სოკო კიდევ უფრო არომატულია." },
  { id:"nadugi",cook:"nana",name:"ნადუღი პიტნით",cat:"საწებელი",emoji:"🧀",tb:"linear-gradient(150deg,#eef2e6,#c7d3b0)",time:"20 წთ",serves:"4 კაცი",level:"მარტივი",desc:"ნაზი ხაჭო პიტნითა და ცოტა მარილით.",ingredients:["ხაჭო — 400 გ","პიტნა — 1 კონა","მარილი — 1/2 ჩ/კ","კარაქი — 30 გ"],steps:["ხაჭო ჩანგლით მოზილე.","პიტნა დაჭერი და აურიე.","დაუმატე მარილი.","სურვილისამებრ დაამატე კარაქი.","გააგრილე 15 წუთი.","მიირთვი მჭადთან."],tip:"შესანიშნავი შესავსებია ხაჭაპურისთვისაც." },
  { id:"ghomi",cook:"medea",name:"ღომი სულგუნით",cat:"გარნირი",emoji:"🍚",tb:"linear-gradient(150deg,#efe7d3,#cdbf9c)",time:"40 წთ",serves:"4 კაცი",level:"მარტივი",desc:"სამეგრელოს სქელი სიმინდის ფაფა გამდნარი სულგუნით.",ingredients:["ღომის ბურღული — 200 გ","სიმინდის ფქვილი — 100 გ","წყალი — 1.2 ლ","სულგუნი — 300 გ","მარილი — გემოვნებით"],steps:["წყალი ადუღე მარილთან.","ჩაყარე ბურღული, ადუღე 20 წუთი.","ჩააფშვნიტე ფქვილი, ინტენსიურად ურიე.","ურიე სქელ მასამდე.","ჩააფლე დაჭრილი სულგუნი.","მიაწოდე სანამ ყველი გამდნარია."],tip:"ღომი უწყვეტად უნდა აურიო." },
  { id:"lobio",cook:"medea",name:"ლობიო ქოთანში",cat:"მთავარი კერძი",emoji:"🫘",tb:P[1],time:"90 წთ",serves:"5 კაცი",level:"მარტივი",desc:"სქელი, სუნელებით სავსე წითელი ლობიო, ქოთანში მოხარშული.",ingredients:["წითელი ლობიო — 500 გ","ხახვი — 2 ცალი","ნიორი — 4 კბილი","ქინძი — 1 კონა","ხმელი ქინძი — 1 ჩ/კ","უცხო სუნელი — 1 ჩ/კ","ღვინის ძმარი — 1 ს/კ","მარილი — გემოვნებით"],steps:["ლობიო ღამით დაალბე, ადუღე რბილობამდე.","ხახვი შემოწვი ოქროსფრად.","ლობიოს ნახევარი გახეხე, დაამატე ხახვს.","ჩაყარე სუნელები, ნიორი და ძმარი.","ადუღე 15 წუთი.","დააყარე ქინძი, მიირთვი მჭადთან."],tip:"ცოტა ნიგოზი დაუმატე — გემო უფრო ღრმა გახდება." },
  { id:"mchadi",cook:"medea",name:"მჭადი",cat:"ცომეული",emoji:"🌽",tb:"linear-gradient(150deg,#f0d271,#d4a13a)",time:"25 წთ",serves:"6 ცალი",level:"მარტივი",desc:"სიმინდის პური — გარედან ხრაშუნა, შიგნით რბილი.",ingredients:["სიმინდის ფქვილი — 400 გ","თბილი წყალი — 300 მლ","მარილი — 1 ჩ/კ","ზეთი შესაწვავად"],steps:["ფქვილს დაუმატე მარილი და წყალი.","მოზილე სქელი ცომი.","სველი ხელით გააკეთე ფორმები.","გააცხელე ტაფა ზეთით.","შეწვი თითო მხრიდან 4–5 წუთი.","მიირთვი ლობიოსთან."],tip:"ცომში იმერული ყველი ჩააფშვნიტე." },
  { id:"pelamushi",cook:"medea",name:"ფელამუში",cat:"ტკბილეული",emoji:"🍇",tb:"linear-gradient(150deg,#8e4b6e,#5a2a48)",time:"45 წთ",serves:"6 კაცი",level:"საშუალო",desc:"ყურძნის წვენის ტკბილი პუდინგი, ნიგვზით მოყრილი.",ingredients:["ბადაგი — 1 ლ","ხორბლის ფქვილი — 150 გ","შაქარი — გემოვნებით","ნიგოზი — მოსაყრელად"],steps:["ცივ ბადაგში გახსენი ფქვილი.","დანარჩენი ბადაგი ადუღე.","ჩაასხი ფქვილის ნარევი მორევით.","ადუღე 15–20 წუთი.","გადაასხი ფორმებში, მოაყარე ნიგოზი.","გააგრილე."],tip:"ჩხირზე ნიგოზი ააცმევ და ამოავლებ — ჩურჩხელა გამოვა." },
  { id:"chakapuli",cook:"eter",name:"ჩაქაფული",cat:"მთავარი კერძი",emoji:"🍲",tb:P[2],time:"55 წთ",serves:"5 კაცი",level:"საშუალო",desc:"გაზაფხულის კერძი — ბატკანი ტყემლით, ტარხუნითა და ღვინით.",ingredients:["ბატკნის ხორცი — 1 კგ","მწვანე ხახვი — 3 კონა","ტარხუნი — 2 კონა","ქინძი — 1 კონა","მწვანე ტყემალი — 300 გ","თეთრი ღვინო — 200 მლ","ნიორი — 4 კბილი","მარილი — გემოვნებით"],steps:["ხორცი ჩააწყვე ქვაბში.","დააფინე ხახვი, ტარხუნი, ქინძი.","ჩააყოლე ტყემალი და ნიორი.","ჩაასხი ღვინო, დააფარე.","ადუღე 40 წუთი.","დაასხი მარილი, მიირთვი ცხელი."],tip:"წყალს ნუ დაუმატებ." },
  { id:"chakhokhbili",cook:"eter",name:"ქათმის ჩახოხბილი",cat:"მთავარი კერძი",emoji:"🍗",tb:"linear-gradient(150deg,#e8895a,#b3472a)",time:"50 წთ",serves:"4 კაცი",level:"მარტივი",desc:"დანელებული ქათამი პომიდვრის სქელ, სუნელებიან საწებელში.",ingredients:["ქათმის ხორცი — 1 კგ","ხახვი — 3 ცალი","პომიდორი — 5 ცალი","ნიორი — 4 კბილი","ქინძი — 1 კონა","ომბალო — 1 ჩ/კ","უცხო სუნელი — 1 ჩ/კ","მარილი — გემოვნებით"],steps:["ქათამი ჩააქცი ცხელ ქვაბში.","დაუმატე ხახვი, ადუღე 10 წუთი.","პომიდორი ჩააყოლე სქელ საწებლამდე.","ჩაყარე სუნელები, დააფარე 15 წუთით.","დაუმატე ნიორი და ქინძი.","დაასვენე 5 წუთი."],tip:"ცოტა თეთრი ღვინო ჩაასხი." },
  { id:"khinkali",cook:"eter",name:"ხინკალი",cat:"ცომეული",emoji:"🥟",tb:"linear-gradient(150deg,#e9e2d2,#c9bda0)",time:"75 წთ",serves:"6 კაცი",level:"საშუალო",desc:"წვნიანი, ხორცით სავსე ქართული ხინკალი.",ingredients:["ფქვილი — 600 გ","წყალი — 250 მლ","მარილი — 1 ჩ/კ","დაკეპილი ხორცი — 600 გ","ხახვი — 2 ცალი","ნიორი — 3 კბილი","ქინძი — 1 კონა","ძირა — 1 ჩ/კ","წყალი ფარშისთვის — 150 მლ"],steps:["მოზილე მაგარი ცომი, დააფარე 30 წუთით.","ხორცს დაუმატე ხახვი, ნიორი, სუნელები.","ფარშში ჩაასხი წყალი, აურიე.","ამოჭერი წრეები, დაადე ფარში.","შეკარი კეხი ნაოჭებით.","ადუღე 8–10 წუთი."],tip:"ჯერ წვენი შესვი, მერე დანარჩენი." },
  { id:"badrijani",cook:"lida",name:"ბადრიჯანი ნიგვზით",cat:"საწებელი",emoji:"🍆",tb:P[3],time:"40 წთ",serves:"4 კაცი",level:"მარტივი",desc:"შემწვარი ბადრიჯნის რულონები ნიგვზისა და ნივრის საწებლით.",ingredients:["ბადრიჯანი — 3 ცალი","ნიგოზი — 200 გ","ნიორი — 3 კბილი","ხმელი ქინძი — 1 ჩ/კ","უცხო სუნელი — 1 ჩ/კ","ღვინის ძმარი — 1 ს/კ","ბროწეული — გემოვნებით","ზეთი შესაწვავად"],steps:["ბადრიჯანი დაჭერი, მოაყარე მარილი, დაასვენე 15 წუთი.","შემწვარი და გააცივე.","ნიგოზი დაფქვი ნივრით და სუნელებით.","დაუმატე ძმარი და მარილი.","წაუსვი და გააკეთე რულონი.","მოაყარე ბროწეული."],tip:"ნიგოზი ხელით დანაყე." },
  { id:"phkhali",cook:"lida",name:"ფხალი",cat:"საწებელი",emoji:"🥬",tb:"linear-gradient(150deg,#8fa863,#556634)",time:"35 წთ",serves:"4 კაცი",level:"მარტივი",desc:"ისპანახის ფხალი ნიგვზით, ბროწეულით.",ingredients:["ისპანახი — 500 გ","ნიგოზი — 150 გ","ხახვი — 1 ცალი","ნიორი — 2 კბილი","ხმელი ქინძი — 1 ჩ/კ","უცხო სუნელი — 1 ჩ/კ","ღვინის ძმარი — 1 ს/კ","ბროწეული — გემოვნებით"],steps:["ისპანახი მოხარშე 3 წუთი, გამოწურე.","ნიგოზი დაფქვი ნივრით და სუნელებით.","დაჭერი და აურიე ნიგვზში.","დაუმატე ძმარი და მარილი.","ჩამოაყალიბე ბურთულები.","მოაყარე ბროწეული."],tip:"იგივე ნარევით ჭარხლის ფხალიც გამოვა." },
];

// ─── DB init ───
async function initDb() {
  await pool.query(`
    create table if not exists cooks (
      id text primary key, name text not null, city text, av text, cc text,
      created_at timestamptz default now()
    );`);
  await pool.query(`
    create table if not exists recipes (
      id text primary key,
      cook text references cooks(id) on delete cascade,
      name text not null, cat text, emoji text, tb text,
      time_text text, serves text, level text, description text,
      ingredients jsonb default '[]', steps jsonb default '[]', tip text,
      created_by integer,
      created_at timestamptz default now()
    );`);
  await pool.query(`
    create table if not exists users (
      id serial primary key,
      name text not null,
      email text unique not null,
      pass_hash text not null,
      created_at timestamptz default now()
    );`);
  // migration-safe: არსებულ ბაზას დაუმატე created_by თუ არ აქვს
  await pool.query("alter table recipes add column if not exists created_by integer;");
  // migration-safe: ბებია მიბმული იყოს შემქმნელ მომხმარებელზე
  await pool.query("alter table cooks add column if not exists owner_email text;");
  // migration-safe: ბებიის რეიტინგი (0–5, ხარისხის მიხედვით) და განსხვავებული ნიშანი/სპეციალობა
  await pool.query("alter table cooks add column if not exists rating real default 0;");
  await pool.query("alter table cooks add column if not exists badge text;");
  // migration-safe: კერძის ფოტო (data URL ან ბმული)
  await pool.query("alter table recipes add column if not exists photo text;");
  // ვიზიტორთა შეფასება + კომენტარი (თითო მომხმარებელი — თითო შეფასება რეცეპტზე)
  await pool.query(`
    create table if not exists reviews (
      id text primary key,
      recipe_id text references recipes(id) on delete cascade,
      user_id integer references users(id) on delete cascade,
      user_name text,
      rating integer not null check (rating between 1 and 5),
      comment text,
      created_at timestamptz default now(),
      unique(recipe_id, user_id)
    );`);
  // რჩეული / შენახული რეცეპტები
  await pool.query(`
    create table if not exists favorites (
      user_id integer references users(id) on delete cascade,
      recipe_id text references recipes(id) on delete cascade,
      created_at timestamptz default now(),
      primary key (user_id, recipe_id)
    );`);

  const { rows } = await pool.query("select count(*)::int as n from cooks");
  if (rows[0].n === 0) {
    for (const c of SEED_COOKS) {
      await pool.query(
        "insert into cooks(id,name,city,av,cc) values($1,$2,$3,$4,$5) on conflict do nothing",
        [c.id, c.name, c.city, c.av, c.cc]
      );
    }
    for (const r of SEED_RECIPES) await insertRecipe(r);
    console.log("✅ seed data ჩაიტვირთა");
  }
}

async function insertRecipe(r, userId = null) {
  await pool.query(
    `insert into recipes(id,cook,name,cat,emoji,tb,time_text,serves,level,description,ingredients,steps,tip,photo,created_by)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) on conflict (id) do nothing`,
    [r.id, r.cook, r.name, r.cat, r.emoji, r.tb, r.time, r.serves, r.level, r.desc,
     JSON.stringify(r.ingredients || []), JSON.stringify(r.steps || []), r.tip || null, r.photo || null, userId]
  );
}

// ─── auth helpers ───
const signToken = (u) => jwt.sign({ id: u.id, name: u.name, email: u.email }, JWT_SECRET, { expiresIn: TOKEN_TTL });
const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, is_admin: isAdmin(u.email) });

// მოითხოვს ვალიდურ Bearer ტოკენს; წინააღმდეგ შემთხვევაში 401 code:"auth"
function requireAuth(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: "auth_required", code: "auth" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    res.status(401).json({ error: "invalid_token", code: "auth" });
  }
}

// მოითხოვს ავტორიზაციას + ადმინის ელფოსტას (ADMIN_EMAILS)
function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (!isAdmin(req.user?.email))
      return res.status(403).json({ error: "admin_only", code: "forbidden" });
    next();
  });
}

// ─── Routes ───
app.get("/", (_req, res) => res.json({ ok: true, service: "ბებოს რეცეპტები API" }));

// ── AUTH ──
app.post("/api/register", async (req, res) => {
  try {
    const name = (req.body?.name || "").trim();
    const email = (req.body?.email || "").trim().toLowerCase();
    const password = req.body?.password || "";
    if (!name || !email || password.length < 6)
      return res.status(400).json({ error: "invalid_input", code: "invalid" });

    const exists = await pool.query("select 1 from users where email=$1", [email]);
    if (exists.rowCount) return res.status(409).json({ error: "email_taken", code: "exists" });

    const passHash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      "insert into users(name,email,pass_hash) values($1,$2,$3) returning id,name,email",
      [name, email, passHash]
    );
    const user = rows[0];
    res.status(201).json({ user: publicUser(user), token: signToken(user) });
  } catch (e) { console.error(e); res.status(500).json({ error: "db_error" }); }
});

app.post("/api/login", async (req, res) => {
  try {
    const email = (req.body?.email || "").trim().toLowerCase();
    const password = req.body?.password || "";
    const { rows } = await pool.query("select * from users where email=$1", [email]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.pass_hash)))
      return res.status(401).json({ error: "bad_credentials", code: "bad" });
    res.json({ user: publicUser(user), token: signToken(user) });
  } catch (e) { console.error(e); res.status(500).json({ error: "db_error" }); }
});

app.get("/api/data", async (_req, res) => {
  try {
    const [cooks, recipes] = await Promise.all([
      pool.query("select id,name,city,av,cc,owner_email,rating,badge from cooks order by created_at asc"),
      pool.query(`
        select r.*,
          coalesce(avg(rv.rating),0)::numeric(3,2) as rating_avg,
          count(rv.rating)::int as rating_count
        from recipes r
        left join reviews rv on rv.recipe_id = r.id
        group by r.id
        order by r.created_at asc`),
    ]);
    res.json({ cooks: cooks.rows, recipes: recipes.rows.map(rowToRecipe) });
  } catch (e) { console.error(e); res.status(500).json({ error: "db_error" }); }
});

app.post("/api/cooks", requireAuth, async (req, res) => {
  try {
    const c = req.body || {};
    if (!c.id || !c.name) return res.status(400).json({ error: "id_name_required" });
    const owner = req.user.email;
    // ერთი მომხმარებლისთვის ერთი და იგივე სახელის ბებია აღარ დაემატოს — დაბრუნდეს არსებული
    const dup = await pool.query(
      "select id from cooks where owner_email=$1 and lower(name)=lower($2) limit 1",
      [owner, c.name]
    );
    if (dup.rowCount) return res.status(200).json({ ok: true, id: dup.rows[0].id, existed: true });
    await pool.query(
      "insert into cooks(id,name,city,av,cc,owner_email) values($1,$2,$3,$4,$5,$6) on conflict (id) do nothing",
      [c.id, c.name, c.city || null, c.av || "👵", c.cc || P[0], owner]
    );
    res.status(201).json({ ok: true, id: c.id });
  } catch (e) { console.error(e); res.status(500).json({ error: "db_error" }); }
});

app.post("/api/recipes", requireAuth, async (req, res) => {
  try {
    const r = req.body || {};
    if (!r.id || !r.name || !r.cook) return res.status(400).json({ error: "missing_fields" });
    await insertRecipe(r, req.user.id);
    res.status(201).json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: "db_error" }); }
});

app.delete("/api/recipes/:id", requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query("select created_by from recipes where id=$1", [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: "not_found", code: "not_found" });
    // მხოლოდ ავტორს (ან seed რეცეპტებს, created_by=null), ან ადმინს შეუძლია წაშლა
    if (rows[0].created_by != null && rows[0].created_by !== req.user.id && !isAdmin(req.user.email))
      return res.status(403).json({ error: "forbidden", code: "forbidden" });
    await pool.query("delete from recipes where id=$1", [req.params.id]);
    res.status(204).end();
  } catch (e) { console.error(e); res.status(500).json({ error: "db_error" }); }
});

// ── REVIEWS (ვიზიტორთა შეფასება + კომენტარი) ──
// კონკრეტული რეცეპტის ყველა შეფასება
app.get("/api/recipes/:id/reviews", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `select id, recipe_id, user_id, user_name, rating, comment, created_at
       from reviews where recipe_id=$1 order by created_at desc`,
      [req.params.id]
    );
    const agg = await pool.query(
      "select coalesce(avg(rating),0)::numeric(3,2) as avg, count(*)::int as count from reviews where recipe_id=$1",
      [req.params.id]
    );
    res.json({
      reviews: rows,
      rating_avg: Number(agg.rows[0].avg) || 0,
      rating_count: agg.rows[0].count || 0,
    });
  } catch (e) { console.error(e); res.status(500).json({ error: "db_error" }); }
});

// შეფასების დამატება/განახლება — თითო მომხმარებელი, თითო შეფასება რეცეპტზე
app.post("/api/recipes/:id/reviews", requireAuth, async (req, res) => {
  try {
    const recipeId = req.params.id;
    let rating = Number(req.body?.rating);
    const comment = String(req.body?.comment || "").trim().slice(0, 1000);
    if (!Number.isFinite(rating) || rating < 1 || rating > 5)
      return res.status(400).json({ error: "invalid_rating", code: "invalid" });
    rating = Math.round(rating);
    const exists = await pool.query("select 1 from recipes where id=$1", [recipeId]);
    if (!exists.rowCount) return res.status(404).json({ error: "not_found", code: "not_found" });
    const id = `rev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    await pool.query(
      `insert into reviews(id, recipe_id, user_id, user_name, rating, comment)
       values($1,$2,$3,$4,$5,$6)
       on conflict (recipe_id, user_id)
       do update set rating=excluded.rating, comment=excluded.comment, user_name=excluded.user_name, created_at=now()`,
      [id, recipeId, req.user.id, req.user.name || null, rating, comment || null]
    );
    res.status(201).json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: "db_error" }); }
});

// ── FAVORITES (რჩეული / შენახული) ──
app.get("/api/favorites", requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "select recipe_id from favorites where user_id=$1 order by created_at desc",
      [req.user.id]
    );
    res.json({ favorites: rows.map((r) => r.recipe_id) });
  } catch (e) { console.error(e); res.status(500).json({ error: "db_error" }); }
});

app.post("/api/favorites/:id", requireAuth, async (req, res) => {
  try {
    await pool.query(
      "insert into favorites(user_id, recipe_id) values($1,$2) on conflict do nothing",
      [req.user.id, req.params.id]
    );
    res.status(201).json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: "db_error" }); }
});

app.delete("/api/favorites/:id", requireAuth, async (req, res) => {
  try {
    await pool.query(
      "delete from favorites where user_id=$1 and recipe_id=$2",
      [req.user.id, req.params.id]
    );
    res.status(204).end();
  } catch (e) { console.error(e); res.status(500).json({ error: "db_error" }); }
});

// ── ADMIN ──
// მიმდინარე მომხმარებელი ადმინია თუ არა (frontend-ის ბმულის საჩვენებლად)
app.get("/api/me", requireAuth, (req, res) => {
  res.json({ id: req.user.id, name: req.user.name, email: req.user.email, is_admin: isAdmin(req.user.email) });
});

// ყველა დარეგისტრირებული მომხმარებელი + მისი რეცეპტების რაოდენობა
app.get("/api/admin/users", requireAdmin, async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      select u.id, u.name, u.email, u.created_at,
        (select count(*)::int from recipes r where r.created_by = u.id) as recipe_count
      from users u
      order by u.created_at desc`);
    res.json({ users: rows.map((u) => ({ ...u, is_admin: isAdmin(u.email) })) });
  } catch (e) { console.error(e); res.status(500).json({ error: "db_error" }); }
});

// ყველა რეცეპტი ავტორის ინფოთი (ვინ ატვირთა)
app.get("/api/admin/recipes", requireAdmin, async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      select r.id, r.name, r.cat, r.emoji, r.cook, r.created_at, r.created_by,
        c.name as cook_name,
        u.name as author_name, u.email as author_email
      from recipes r
      left join cooks c on c.id = r.cook
      left join users u on u.id = r.created_by
      order by r.created_at desc`);
    res.json({ recipes: rows });
  } catch (e) { console.error(e); res.status(500).json({ error: "db_error" }); }
});

// ყველა ბებია — რეიტინგით, განსხვავებული ნიშნით და ატვირთული რეცეპტების რაოდენობით
app.get("/api/admin/cooks", requireAdmin, async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      select c.id, c.name, c.city, c.av, c.cc, c.owner_email, c.rating, c.badge, c.created_at,
        (select count(*)::int from recipes r where r.cook = c.id) as recipe_count
      from cooks c
      order by (select count(*) from recipes r where r.cook = c.id) desc, c.created_at asc`);
    res.json({ cooks: rows });
  } catch (e) { console.error(e); res.status(500).json({ error: "db_error" }); }
});

// ბებიის რეიტინგის (0–5) და განსხვავებული ნიშნის რედაქტირება
app.patch("/api/admin/cooks/:id", requireAdmin, async (req, res) => {
  try {
    const b = req.body || {};
    const fields = [], vals = []; let i = 1;
    if (b.rating != null) {
      let rt = Number(b.rating);
      if (!Number.isFinite(rt)) rt = 0;
      rt = Math.max(0, Math.min(5, Math.round(rt * 2) / 2)); // 0–5, ნახევრიანი ბიჯით
      fields.push(`rating=$${i++}`); vals.push(rt);
    }
    if (b.badge !== undefined) {
      const bg = (b.badge || "").trim().slice(0, 60);
      fields.push(`badge=$${i++}`); vals.push(bg || null);
    }
    if (!fields.length) return res.status(400).json({ error: "no_fields" });
    vals.push(req.params.id);
    const { rowCount } = await pool.query(`update cooks set ${fields.join(",")} where id=$${i}`, vals);
    if (!rowCount) return res.status(404).json({ error: "not_found", code: "not_found" });
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: "db_error" }); }
});

// ზოგადი სტატისტიკა
app.get("/api/admin/stats", requireAdmin, async (_req, res) => {
  try {
    const [u, r, c] = await Promise.all([
      pool.query("select count(*)::int as n from users"),
      pool.query("select count(*)::int as n from recipes"),
      pool.query("select count(*)::int as n from cooks"),
    ]);
    res.json({ users: u.rows[0].n, recipes: r.rows[0].n, cooks: c.rows[0].n });
  } catch (e) { console.error(e); res.status(500).json({ error: "db_error" }); }
});

// ─── start ───
initDb()
  .then(() => app.listen(PORT, () => console.log(`🍲 API გაშვებულია http://localhost:${PORT}`)))
  .catch((e) => { console.error("DB init ვერ მოხერხდა:", e); app.listen(PORT, () => console.log(`API გაშვებულია (DB-ის გარეშე) :${PORT}`)); });
