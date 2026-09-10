# Přihlášení Sledovátka na GitHub Pages

GitHub Pages poskytuje statické HTML, CSS a JavaScript. Účty a cloudová data zajišťuje **Supabase**, přihlášení využívá pouze **Google OAuth**. Zdroj webu zůstává v GitHubu a nemusí mít vlastní Node/PHP server. [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)

Konfigurace používá `googleEnabled: true`, `manualLinkingEnabled: true` a `emailEnabled: false`. Google provider a Allow manual linking jsou povolené v Supabase; GitHub provider je vypnutý. Registrace nových uživatelů a potvrzení e-mailu jsou zapnuté; anonymní přihlášení je vypnuté. Google aplikace je External / In production. E-mailový poskytovatel je vypnutý a SMTP není nastavené. Používání bez účtu, místní Šuplík a ruční přenos jsou dostupné také bez přihlášení. Výsledky ověření konkrétního nasazení a skutečného OAuth přihlášení se evidují samostatně.

## 1. Projekt a databáze

Web používá projekt `aovawjyfphduadggedvf` v regionu `eu-west-1`. Pro běžnou aktualizaci webu není potřeba zakládat nový projekt. Následující postup slouží k nastavení databáze, obnově nebo založení dalšího prostředí.

1. Ve vlastním účtu [Supabase](https://supabase.com/dashboard) založ projekt a zvol vhodný region. Ulož si databázové heslo do správce hesel; do repozitáře nepatří.
2. V **SQL Editor** spusť celý soubor `backend/setup.sql`. Obsahuje jednu transakci a lze jej pro toto schéma spustit opakovaně.
3. V nastavení **Data API → Exposed schemas** ponech `public`. **Nepřidávej `sledovatko_private` mezi Exposed schemas ani Extra search path.** Přístup ke knihovně vede přes dvě veřejné RPC; přímé změny tabulky by obcházely kontrolu souběžných úprav. Stejné soukromé schéma nepřidávej do cesty pro GraphQL. [Exposed schemas](https://supabase.com/docs/guides/api/using-custom-schemas), [GraphQL security](https://supabase.com/docs/guides/graphql/security)
4. V databázi vznikne `sledovatko_private.user_libraries`. Primární klíč je ID uživatele z `auth.users`, čímž je zároveň indexované vyhledávání i pravidlo RLS. SQL zapíná RLS, nastavuje pravidla vlastníka a omezuje oprávnění. Funkce běží jako volající uživatel (`SECURITY INVOKER`) s prázdným `search_path`. Anonymní návštěvník nemá právo číst ani zapisovat cloud. [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Database functions](https://supabase.com/docs/guides/database/functions)

## 2. Google přihlášení

Google Cloud projekt **Sledovatko**, ID `sledovatko-508218`, používá klienta typu Web application. Google Auth Platform má publikum **External** a stav **In production**. Následující nastavení slouží k údržbě nebo obnově této konfigurace; běžná aktualizace webu nevyžaduje vytvoření nového klienta.

1. V **Branding** nastav název aplikace a kontaktní adresu správce. Homepage je `https://sledovatko.github.io/`, privacy policy `https://sledovatko.github.io/privacy.html` a terms of service `https://sledovatko.github.io/terms.html`. Kontaktní adresu a tajné údaje neukládej do repozitáře.
2. V **Clients** má klient typu **Web application** Authorized JavaScript origin `https://sledovatko.github.io` a Authorized redirect URI `https://aovawjyfphduadggedvf.supabase.co/auth/v1/callback`.
3. V **Data Access** ponech pouze `openid`, `https://www.googleapis.com/auth/userinfo.email` a `https://www.googleapis.com/auth/userinfo.profile`. Citlivé a omezené rozsahy jsou prázdné. Přihlašování nepotřebuje Gmail, Disk ani offline Google tokeny. Pro veřejné používání musí **Audience** zůstat **External / In production**. [Nastavení Google OAuth](https://supabase.com/docs/guides/auth/social-login/auth-google)
4. Client ID a client secret patří do **Supabase → Authentication → Sign In / Providers → Google**. Secret se ukládá pouze v serverovém nastavení Supabase. Google je povolený; **Skip nonce checks** i **Allow users without an email** zůstávají vypnuté. Při rotaci nejprve ulož nový klíč do Supabase, potom starý vypni a odstraň v Google Cloud. Tajné hodnoty nepatří do webu, dokumentace ani výstupů testů.
5. Zachovej přesné návratové adresy z části 3 a `googleEnabled: true` v `js/auth-config.js`. Po změně poskytovatele nebo klienta ověř ze skutečné domény přihlášení, čistou návratovou adresu, odhlášení a nové přihlášení. Produkční nastavení samo nenahrazuje ověření skutečného OAuth průchodu.

### Připojení Googlu ke stávající sbírce

Supabase může automaticky spojit identity se stejným ověřeným e-mailem. Při rozdílných e-mailech se na automatické spojení nespoléhej. **Allow manual linking** v Supabase a `manualLinkingEnabled: true` ve veřejné konfiguraci povolují výslovné připojení. Uživatel s dosud platnou relací stávajícího účtu vybere **Připojit Google k tomuto účtu** a potvrdí Google identitu. Aplikace použije `linkIdentity` a zachová stejné Supabase user ID i sbírku. Další přihlášení probíhá přes připojený Google účet. Před odchodem musí dokončit synchronizaci; konflikt nebo nedostupná síť propojení pozastaví. Google identitu, která již patří jinému účtu Sledovátka, tento postup automaticky nepřesouvá ani neslučuje. [Propojování identit](https://supabase.com/docs/guides/auth/auth-identity-linking)

### Přechod od dřívějšího GitHub přihlášení

GitHub přihlášení je vypnuté v rozhraní i v Supabase. Historicky připojené identity a knihovny se tím nemažou. Účet s připojeným Googlem dál používá stejnou knihovnu pod stejným Supabase user ID, bez dalšího přihlášení přes GitHub.

Výslovné připojení Googlu vyžaduje platnou relaci původního účtu. Pokud už není dostupná a Google k účtu není připojený, nelze slibovat, že přihlášení pod jinou identitou automaticky převezme jeho sbírku. Dostupnou místní sbírku lze zálohovat a po porovnání ručně přenést; samotné vypnutí poskytovatele účty neslučuje. Při údržbě nemaž původní identity, uživatele ani databázové řádky kvůli změně přihlašování.

### Volitelně později: e-mail a heslo

Tato část popisuje volitelné přidání e-mailu a hesla. Výchozí konfigurace webu má `emailEnabled: false` a Email provider je vypnutý. Před zapnutím formuláře nastav vlastní SMTP, návratové adresy a ověř doručování i obnovu hesla. Poté nastav `emailEnabled: true` a publikuj aktualizaci webu.

V **Authentication** povol poskytovatele **Email**, registrace uživatelů a **Confirm email**. Pro hesla nastav alespoň 12 znaků; klient toto minimum také kontroluje. Nastavení Supabase je rozhodující i pro požadavky odeslané mimo web. [Password authentication](https://supabase.com/docs/guides/auth/passwords)

Pro veřejnou registraci nastav **vlastní SMTP** v Authentication → SMTP Settings: ověřenou odesílací doménu, odesílací adresu, server, port a přihlašovací údaje z vybraného poskytovatele. Přihlašovací údaje SMTP patří pouze do Supabase. Jeho výchozí e-mailová služba je určena pro vyzkoušení a omezuje příjemce na adresy týmu projektu. Nezapínej veřejný registrační formulář s očekáváním, že tento výchozí server bude obsluhovat všechny uživatele. [SMTP pro produkci](https://supabase.com/docs/guides/auth/auth-smtp)

V **Email Templates** mohou zůstat standardní odkazy `{{ .ConfirmationURL }}` pro **Confirm signup** a **Reset password**. Lze přeložit nadpisy a doprovodný text do češtiny. Nenahrazuj tyto odkazy trasou `/auth/confirm` nebo `/reset-password`, pokud pro ně nemáš samostatnou stránku: tento balíček zpracuje návrat přímo v `index.html`. [E-mailové šablony](https://supabase.com/docs/guides/auth/auth-email-templates)

## 3. Přesné návratové adresy

V Authentication → **URL Configuration** nastav pro tuto doménu následující Site URL a obě přesné návratové adresy OAuth:

```text
Site URL:
https://sledovatko.github.io/

Redirect URLs:
https://sledovatko.github.io/?auth=oauth
https://sledovatko.github.io/index.html?auth=oauth
```

Při zapnutí e-mailového poskytovatele přidej navíc jeho návratové adresy:

```text
https://sledovatko.github.io/?auth=confirm
https://sledovatko.github.io/?auth=recovery
```

Pokud se aplikace někdy přesune do projektového repozitáře, použij například `https://uzivatel.github.io/nazev-repozitare/` a stejnou cestu v návratových adresách. Pro případné e-mailové přihlášení přes explicitní `/index.html` přidej i obě e-mailové varianty s touto cestou, nebo návštěvníky směřuj na jedinou kanonickou adresu.

Pro lokální test přidej samostatně OAuth adresu a podle používaného poskytovatele také e-mailové adresy:

```text
http://127.0.0.1:8765/?auth=oauth
http://127.0.0.1:8765/?auth=confirm
http://127.0.0.1:8765/?auth=recovery
```

Nastav skutečné adresy, které web používá; `localhost` a `127.0.0.1` jsou různé počátky. V produkci používej přesné cesty místo širokého wildcardu. [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)

Aplikace používá **PKCE**. Přihlašovací tok dokonči ve **stejném prohlížeči a zařízení**, kde začal. Totéž později platí pro potvrzovací e-mail a obnovu hesla; odkaz neotvírej v soukromém okně ani v odděleném prohlížeči e-mailové aplikace. Pokud výměna kódu selže, začni příslušný postup znovu. `?code=…` se zpracuje před spuštěním aplikace, poté se citlivé parametry odstraní z adresy. Callback poskytovatele zpracuje Supabase a návrat aplikace obslouží statická stránka; vlastní server není potřeba. [PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow)

## 4. Veřejná konfigurace webu

Projektová URL a veřejný klíč patří do `js/auth-config.js`. Následující ukázka odpovídá přihlášení pouze přes Google s výslovným propojením ke stávajícím účtům; veřejný klíč nahrazuje zástupným textem:

```js
window.SLEDOVATKO_AUTH = {
  url: 'https://aovawjyfphduadggedvf.supabase.co',
  publishableKey: 'ZDE_JE_VE_SKUTECNEM_SOUBORU_VEREJNY_KLIC',
  googleEnabled: true,
  manualLinkingEnabled: true,
  emailEnabled: false
};
```

Použij pouze publishable key, případně starší veřejný `anon` key. **Secret key, service-role key, databázové heslo ani SMTP heslo nepatří do JavaScriptu nebo GitHubu.** Veřejný klíč identifikuje projekt; přístup k jednotlivým datům řídí přihlášení a databázové RLS. [API keys](https://supabase.com/docs/guides/api/api-keys)

Soubor publikuj spolu s ostatními soubory webu na stávající doméně. Zachování domény zachová přístup ke stávajícím místním datům. GitHub Pages musí používat HTTPS. Heslo ke Googlu uživatel zadává u Googlu. Při případném zapnutí e-mailových formulářů odesílá hesla Supabase SDK přímo do Supabase Auth; aplikace je nevkládá do knihovny ani do přenosového kódu.

### Automatické publikování a aktualizace offline kopie

Nahraj celý zdroj do kořene repozitáře včetně `.github/workflows/pages.yml` a `scripts/`. Poté nastav **Settings → Pages → Build and deployment → Source → GitHub Actions**. Workflow spouští sestavení po změně větve `main` a lze jej spustit i ručně v **Actions → Deploy Sledovatko to GitHub Pages → Run workflow**. Pokud používáš jinou hlavní větev, uprav `branches` v tomto souboru. Workflow používá oficiální Pages akce a odděluje sestavení od nasazení. [GitHub Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

Při nasazení přes připravený Actions workflow poběží `node scripts/build-cache.cjs --stage`. Skript neinstaluje balíčky. Přepočítá hash HTML, konfigurace účtu, JavaScriptu, stylů, manifestu a ikon a zapíše novou verzi do `sw.js`. Změna `js/auth-config.js` tak automaticky obnoví i offline kopii webu. Publikuje se pouze `index.html`, `privacy.html`, `terms.html`, `manifest.webmanifest`, `sw.js`, `LICENSE` a obsah `js/`, `css/`, `icons/`; zdroje backendu, testy, návody, build skripty a workflow se do webového artefaktu nekopírují. Zdroj v repozitáři je nadále viditelný podle nastavení jeho soukromí.

Při **ručním publikování z větve** spusť po poslední úpravě webu `node scripts/build-cache.cjs` a nahraj i výsledný `sw.js`. Pokud skript nespouštíš, změň alespoň hodnotu `CACHE` v `sw.js` na novou unikátní verzi; při přidávání či odebírání souborů je ale nutné upravit také `ASSETS`, proto je generátor spolehlivější. Po zveřejnění obnov stránku a potvrď nabídnutou aktualizaci aplikace. GitHub Actions workflow se při publikování přímo z větve nepoužije.

Bez aktivního poskytovatele přihlášení zůstává funkční používání bez účtu, místní Šuplík i ruční přenos. Publikační workflow samo nemění nastavení poskytovatelů, propojování identit ani e-mailové služby. Při údržbě zachovej původní Supabase projekt, existující uživatele a jejich vazby na knihovnu.

## 5. Cloudový kontrakt a souběh zařízení

```js
// Uživatelské ID bere server z ověřené relace.
const { data: cloud, error } = await supabase.rpc('get_library');
// {revision:0,snapshot:null,updated_at:null} je nový účet.

const { data: saved, error: saveError } = await supabase.rpc('save_library', {
  p_expected_revision: cloud.revision,
  p_snapshot: { _v: 2, wm_favorites: [] }
});
```

Úspěšný zápis vrací `{ok:true,conflict:false,revision,updated_at}`. Při střetu vrátí RPC HTTP úspěch, ale `{ok:false,conflict:true,revision,snapshot,updated_at}`. **Konflikt se nesmí automaticky přepsat pouze novým číslem revize.** Nejdřív je třeba porovnat nebo sloučit poslední cloudová data s místními a případně nechat uživatele zvolit, která verze má platit. Síťová chyba znamená neověřený výsledek; následuje nové načtení, nikoli slepé potvrzení uložení.

Snapshot je běžný JSON objekt ve verzi 2. Hodnoty `wm_*` jsou nativní pole a objekty, nikoli JSON řetězce z původního base64 exportu. Povinné je `_v:2` a `wm_favorites:[]`; `_t` je volitelný číselný čas v milisekundách. Povolené klíče:

```text
wm_favorites, wm_watched, wm_ratings, wm_comments, wm_labels, wm_order,
wm_saved_searches, wm_watched_episodes, wm_tv_meta, wm_media_meta,
wm_custom_labels, wm_hidden_labels
```

Databáze odmítá jinou verzi, neznámé vrchní klíče, nesprávné základní typy a snapshot větší než **2 MiB** v textové serializaci PostgreSQL. JSONB přidává při serializaci mezery, proto je vhodné už v prohlížeči ponechat rezervu pod limitem. Název `imdbId` je historický: film má hodnotu jako `123`, seriál jako `tv:123`; nejsou to identifikátory IMDb.

První zápis založí prázdný zamykatelný řádek, poté zamkne aktuální řádek a porovná revizi. Další zápisy se stejnou původní revizí dostanou konflikt. Vyprázdnění knihovny ukládá prázdný snapshot jako další revizi. Revize se neresetuje, aby staré zařízení nemohlo obnovit smazaná data. Odstranění uživatele v Supabase Auth odstraní jeho řádek přes `ON DELETE CASCADE`.

## 6. Kontrola nastavení a změn

SQL sadu `backend/tests/library.sql` lze spustit v SQL Editoru po nasazení schématu. Obsahuje 10 skupin kontrol anonymního přístupu, oddělení dvou identit, neplatných snapshotů, revizí, konfliktu a odstranění dat při smazání účtu. Testovací změny vrací pomocí `ROLLBACK`. Na REST API ověř také odmítnutí anonymních RPC a přístupu přes nevystavené soukromé schéma.

Po prvním nasazení a po změnách přihlašování nebo synchronizace ověř:

1. Přihlášení přes Google ze skutečné domény, návrat přes Supabase callback a vytvoření prvního účtu při povolených registracích. Rozhraní nesmí nabízet GitHub ani e-mailové přihlášení; GitHub a Email provider zůstávají v Supabase vypnuté.
2. Výslovné připojení Googlu ke stávajícímu účtu s platnou relací, zachování stejného user ID a sbírky, odhlášení a nové přihlášení přes Google. Zrušené připojení musí zachovat původní platnou relaci i sbírku. Po odhlášení nemá relace bývalého účtu zpřístupnit jeho cloudová data jinému účtu.
3. Dva nezávislé prohlížeče pod jedním testovacím účtem: změna knihovny v každém musí vést ke správné synchronizaci nebo čitelnému konfliktu.
4. Druhý testovací účet: nesmí získat první knihovnu ani přímým RPC požadavkem.
5. Výpadek sítě při ukládání: data zůstanou místně a stav nesmí tvrdit, že je server přijal.
6. Export zálohy a obnovení knihovny. Ruční přenos zůstává použitelný i bez relace.

Při případném pozdějším zapnutí e-mailového přihlášení přibudou samostatné kontroly registrace, potvrzovacího e-mailu, obnovy hesla a skutečného doručování přes vlastní SMTP.

Výsledky místních testů, databázových testů a skutečného přihlášení eviduj samostatně. Úspěšné SQL testy se simulovanými identitami neověřují průchod OAuth poskytovatelem, přihlášený REST požadavek ani dvě souběžná nezávislá databázová spojení.

## Provoz

Omez e-mailové a registrační požadavky v nastavení Supabase Auth, sleduj Auth Logs a databázové chyby. Vyber limity a zálohování odpovídající skutečnému počtu uživatelů a zveřejni kontakt provozovatele spolu s popisem uchovávaných dat. Tento web neslibuje absolutní dostupnost externích služeb; offline zůstává autoritativní místní kopie do doby úspěšné synchronizace.

Pokud uživatel požádá o odstranění účtu, provozovatel jej může odstranit v Authentication → Users; cloudová knihovna se odstraní kaskádově. Samotné odstranění cloudového účtu nevymaže již stažené soubory záloh ani localStorage na jiných zařízeních. Přístupové tokeny po administrátorském smazání účtu mohou doběhnout do expirace, ale zrušený cizí klíč a chybějící řádek brání zápisu nebo načtení původní knihovny.
