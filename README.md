# Sledovátko

Statická aplikace pro GitHub Pages. Nepotřebuje vlastní aplikační server ani instalaci balíčků; při publikování se generuje verze offline cache.

Účty používají přihlášení pouze přes Google a cloudovou synchronizaci v Supabase. Google aplikace má publikum External a stav In production; Google a výslovné propojení identit jsou povolené v Supabase. Přepínače jsou `googleEnabled: true`, `manualLinkingEnabled: true` a `emailEnabled: false`. GitHub poskytuje hosting webu; přihlášení přes GitHub je vypnuté. Místní Šuplík, hledání a ruční přenos fungují také bez účtu. Nastavení backendu popisuje [backend/README.md](backend/README.md); výsledky konkrétního nasazení a přihlášení se evidují samostatně.

## Nasazení

1. Na původních stránkách si nejprve ulož přenosový kód. Uchovej také původní verzi webu pro případ návratu.
2. Nahraj zdroj do kořene repozitáře a zachovej strukturu včetně `js`, `css`, `icons`, manifestu, `sw.js`, `scripts` a `.github/workflows/pages.yml`. Poté nastav GitHub Settings → Pages → Source na GitHub Actions. Workflow při změně větve `main` přepočítá offline cache a nahraje jen veřejné soubory webu. Lze jej spustit také ručně v Actions. Podrobnosti a alternativa publikování z větve jsou v [backend/README.md](backend/README.md).
3. Ponech současnou doménu a HTTPS. Šuplík je uložený v prohlížeči pro konkrétní doménu; jiná doména nebo jiný prohlížeč vyžaduje ruční přenos.
4. Po zveřejnění obnov stránku a zkontroluj svůj Šuplík. Stávající data `wm_*` se převedou automaticky; původní přenosové kódy jsou nadále podporované.

## Funkce

- Tmavý zlatý liquid glass vzhled, průsvitné ovladače, pružné reakce na stisk, animované přechody a respektování systémového omezení pohybu v běžném rozhraní.
- Mobilní hledání i Šuplík používají tři karty vedle sebe při šířce od 320 px. Hledání má filtry ve spodním panelu s tlačítkem Použít, aktivní filtry a samostatné řazení. Na větších obrazovkách se počet sloupců přizpůsobuje prostoru.
- Jedno klepnutí na plakát otevírá detail. Samostatné skleněné + ukládá, … otevírá možnosti. Po odebrání lze změnu vrátit. Akce detailu jsou dostupné dole i při procházení dlouhého popisu nebo epizod.
- Dotykové ovládání rozlišuje klepnutí, posouvání a gesto více prsty. Při posouvání řady se neotevírá detail; na dotykovém zařízení se nespouští náhled určený pro najetí myší. Vodorovné řady se ovládají tažením, na počítači zůstávají dostupné šipky. Okrajová gesta obsluhuje samostatná dotyková vrstva; běžné posouvání uvnitř stránky zůstává nativní.
- Hledání zpracuje vždy poslední dotaz, umí další stránky bez duplicit a hledá i podle původního názvu. Výchozí hledání ve filmech i seriálech používá dvě katalogová volání místo desítek volání přes mnoho stránek a jazyků.
- Uložená hledání mají samostatné tlačítko odebrání. Klepnutí na název spustí hledání; křížek ho pouze odebere z uložených. Stejný výslovný stav používá i ovladač nad výsledky, takže opakované odebrání položku znovu neuloží.
- Domovská stránka ukazuje rozkoukané seriály s dalším dílem, výběr na večer a katalog. Seriálové žánry používají skutečné seriálové výsledky.
- Karty v Pokračovat ve sledování neobsahují + ani …; detail otevře klepnutí na plakát nebo název. Zachovávají postup a označení další epizody.
- Vzhled tvoří černé sklo, stříbrné odlesky hran, zlaté gradienty a názvy přes tmavou spodní část plakátů. Plakáty a hodnocení vycházejí ze skutečného obsahu katalogu.
- Mobilní hledání používá menší kruhové ovladače s větší neviditelnou plochou pro klepnutí. Tři tečky jsou v mobilním hledání na úrovni názvu u pravého okraje. Jejich dotyková plocha má 44 × 44 px a nepřekrývá plochu názvu.
- Šuplík má vlastní hledání, stavy Chci vidět / Rozkoukané / Viděné, řazení a čistší nabídku dalších možností. Štítky mají jednu barevnou značku místo opakovaných ikon. Statistiky a seskupení podle roku jsou v nabídce Šuplíku; skryté štítky lze obnovit. Také seskupení podle roku zachovává na mobilu tři sloupce.
- Výběr na večer nabízí uložené či nové filmy, pouze neviděné a 12 časových voleb: bez omezení nebo limit 30, 45, 60, 90, 120, 150, 180, 210, 240, 300 a 360 minut. Lze současně vynechat více žánrů. Vybraná omezení platí pro Šuplík i nový katalog; chybějící metadata se před doporučením doplňují v omezené frontě.
- Galerie záběrů je v detailu před popisem. Výběr omezuje vizuálně podobné obrázky; záběr lze zvětšit klepnutím nebo klávesnicí. Zachované jsou i filmové plátno, Hot or Not a program tří filmů.
- Escape a tlačítko Zpět zavírají otevřené detaily, filtry, trailer i galerii. Návrat mezi stránkami obnovuje hledání, filtry a pozici.
- Film a seriál se stejným číselným ID již nesdílejí stav sledování, poznámky ani hodnocení.

## Přenos mezi zařízeními

Na domovské stránce použij ikonu dvou šipek. Přenos je ruční snímek současné sbírky, nikoli automatická cloudová synchronizace nebo přihlášení.

- **Odeslat:** vytvoření komprimovaného odkazu, původního kódu nebo záložního souboru `.sledovatko`.
- **QR:** generuje se přímo v prohlížeči a obsahuje skutečný přenosový odkaz. U rozsáhlejší sbírky použij odkaz či soubor. Odkaz z místního náhledu `localhost` na jiném telefonu nefunguje; z veřejné domény ano.
- **Přijmout:** vložení odkazu/kódu nebo výběr souboru. Před importem se ukáže srovnání počtu titulů, epizod, poznámek a hodnocení.
- **Doplnit:** přidá nové tituly a spojí viděné epizody. Současné místní poznámky a hodnocení mají při konfliktu přednost.
- **Nahradit:** použije obsah přenosu místo místních dat; má samostatné potvrzení a možnost stáhnout současnou zálohu.

Kód i odkaz obsahují poznámky a hodnocení, proto je předávej pouze zamýšlenému příjemci. Komprese není šifrování. Přístupový token TMDB se nepřenáší.

## Struktura

`css/base.css` a `css/liquid.css` tvoří základ vzhledu a rozložení, `css/concept.css` a `css/effects.css` vizuální efekty. Poslední vrstva `css/usability.css` upravuje ovládání a mobilní mřížky; `css/account.css` pokrývá účty. `js/touch-controls.js` rozlišuje dotyková gesta a zabraňuje dvojímu aktivování karty. Další chování je rozděleno do souborů pro API, data, navigaci, hledání, domovskou stránku, Šuplík a přenos.

`js/config.js` obsahuje veřejnou frontendovou konfiguraci TMDB. Katalog a plakáty potřebují internet a dostupné TMDB API. `js/auth-config.js` obsahuje veřejnou konfiguraci Supabase; tajné klíče patří pouze do nastavení poskytovatele. QR knihovna je přibalená lokálně pod MIT licencí.

Pro místní náhled spusť libovolný statický HTTP server v této složce, například při dostupném Pythonu `python -m http.server 8765`, a otevři `http://localhost:8765`. Při otevírání přes `file://` nemusí fungovat schránka a odkazy mezi zařízeními.

## Stopáže, účty a instalace

Stopáže se načítají automaticky jen pro viditelné karty. Fronta dovolí nejvýše dva současné požadavky a zahajuje je alespoň 350 ms od sebe. Stejný titul má společný požadavek; odchod ze stránky nebo skrytí karty ruší nepotřebné načítání. Cache pojme 600 záznamů: filmy 30 dní, odhad délky dílu a chybějící délky jeden den. Chyby mají prodlevu, HTTP 429 na minutu zastaví frontu. Film ukazuje hodiny:minuty; seriál „≈ 25 min/díl“. Součet všech sezón se neodhaduje potichu.

První úspěšné přihlášení přes Google vytvoří účet ve Sledovátku. Automatická synchronizace používá oddělené knihovny uživatelů a kontrolu revize. Pokud dvě zařízení změní tutéž knihovnu, uživatel vidí porovnání a zvolí další postup. Místní sbírka se do účtu převezme až po výběru uživatele. Neodeslané změny blokují běžné odhlášení; při nucené změně relace zůstane kopie spojená s původním účtem pro jeho další přihlášení. E-mailová registrace a obnova hesla jsou volitelná možnost a ve výchozí konfiguraci jsou vypnuté.

Google používá stejné tlačítko pro přihlášení i první vytvoření účtu, bez nového hesla. U dřívějšího účtu s dosud platnou relací lze v účtu vybrat **Připojit Google k tomuto účtu**, pokud Google ještě není připojený. Výslovné propojení zachová stejné Supabase user ID a sbírku; další přihlášení probíhá přes Google. Historicky připojená identita ani její data se při vypnutí GitHub přihlášení nemažou. Před přesměrováním se uloží rozepsaná poznámka a dokončí synchronizace; nevyřešený konflikt propojení pozastaví. Samotné nahrání zdrojů nemění serverová nastavení poskytovatelů.

Přihlášení přes Google nevyžaduje SMTP. Pro případné zapnutí e-mailové registrace je potřeba vlastní SMTP, potvrzování e-mailu a ověření doručování i obnovy hesla podle [backend/README.md](backend/README.md). Přihlašovací tok dokonči ve stejném prohlížeči a zařízení, kde začal.

Manifest a service worker umožňují instalaci na plochu a opětovné otevření už načteného základního rozhraní při výpadku připojení. V offline režimu je dostupný místní Šuplík; nový katalog, nenačtené plakáty a přihlášení vyžadují síť. Aktualizace má vlastní tlačítko a před výměnou verze ověří dokončení cloudové synchronizace. Auth/API odpovědi se do service worker cache neukládají.

Importy nyní ověřují typy, URL obrázků, rozměry dat a identitu titulů. Poškozený přenos nemůže vložit HTML do karet, chybějící starší pole dostanou bezpečné výchozí hodnoty. Při nedostatku místa se původní hodnoty obnoví. Ruční export zůstává čitelný pro verze 1 a 2.

## Ověření změn

- Sestavení a obsah veřejného balíčku: `node scripts/test-build-cache.cjs`.
- Databázové chování a oddělení účtů: `backend/tests/library.sql`; postup a integrační scénáře jsou v [backend/README.md](backend/README.md).
- Rozhraní: hledání, Šuplík, nabídky karet a účet při 320 a 390 px, tablet při 768 px a desktop při 1280 px; dále skutečný iPhone/Safari, rozlišení klepnutí a posouvání, okrajová gesta, ovládání klávesnicí, import a export.
- Po publikování: přihlášení a odhlášení na veřejné doméně, synchronizace dvou prohlížečů, výpadek sítě a nabídka aktualizace offline kopie.

Výsledky konkrétního nasazení a místní regresní testy eviduj samostatně mimo veřejný balíček. Testovací kopie se simulovaným přihlášením se nepublikují. Databázové testy a místní simulace samy nepotvrzují skutečný OAuth průchod, fyzický iPhone ani synchronizaci mezi zařízeními.

Základní knihovny jsou přibalené: Supabase JS 2.116.0 a qrcode-generator 2.0.4, obě pod MIT licencí. Web nepoužívá plovoucí CDN verze.
