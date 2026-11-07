"""Сборщик данных для «Пульта Эмпатии».

Запускается GitHub Actions по расписанию (и вручную), пишет:
  data/health.json — доступность сайтов, SSL, домены, карта сайта, переадресации
  data/staff.json  — врачи на empathycenter.ru и на лендинге psychiatrist-online.ru
Только публичные данные, никаких паролей.
"""
import json, re, socket, ssl, time, datetime as dt, urllib.request, urllib.error, html, os, sys

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36 EmpathyPult"
SITES = ["empathycenter.ru", "psychiatrist-online.ru", "empathy-center.ru"]
MAIN = "https://empathycenter.ru"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")

# адреса уволенных, которые должны переадресовывать (301)
REDIRECTS = [
    "/staff/psychiatrists/boyko/",
    "/price/psychiatrist/boyko/",
    "/price/psychiatrist/boyko/boyko-psihiatr-pervichnyy/",
    "/price/psychiatrist/boyko/info-boyko-psihiatr-pervichnyy/",
    "/price/psychiatrist/boyko/boyko-psihiatr-bolnichnyy/",
    "/price/psychiatrist/boyko/boyko-psihiatr-90/",
    "/staff/psychiatrists/kuzmina/",
]
KEY_PAGES = ["/", "/staff/psychiatrists/", "/price/", "/contacts/"]


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


def fetch(url, follow=True, timeout=30):
    t0 = time.time()
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "ru"})
    opener = urllib.request.build_opener() if follow else urllib.request.build_opener(NoRedirect)
    try:
        r = opener.open(req, timeout=timeout)
        body = r.read()
        return {"status": r.status, "ms": int((time.time() - t0) * 1000), "body": body, "location": None}
    except urllib.error.HTTPError as e:
        return {"status": e.code, "ms": int((time.time() - t0) * 1000), "body": b"", "location": e.headers.get("Location")}
    except Exception as e:  # сеть, таймаут
        return {"status": 0, "ms": int((time.time() - t0) * 1000), "body": b"", "location": None, "error": str(e)[:200]}


def ssl_expiry(host):
    try:
        ctx = ssl.create_default_context()
        with socket.create_connection((host, 443), timeout=20) as s:
            with ctx.wrap_socket(s, server_hostname=host) as ss:
                c = ss.getpeercert()
        end = dt.datetime.strptime(c["notAfter"], "%b %d %H:%M:%S %Y %Z")
        issuer = dict(x[0] for x in c.get("issuer", ())).get("organizationName", "")
        return {"until": end.strftime("%Y-%m-%d"), "issuer": issuer}
    except Exception as e:
        return {"until": None, "error": str(e)[:200]}


def whois_ru(domain):
    try:
        with socket.create_connection(("whois.tcinet.ru", 43), timeout=20) as s:
            s.sendall((domain + "\r\n").encode())
            b = b""
            while True:
                x = s.recv(4096)
                if not x:
                    break
                b += x
        t = b.decode("utf-8", "replace")
        g = lambda k: (re.search(rf"^{k}:\s*(.+)$", t, re.M) or [None, None])[1]
        paid = g("paid-till")
        return {"paid_till": paid[:10] if paid else None, "registrar": g("registrar"), "free_date": g("free-date")}
    except Exception as e:
        return {"paid_till": None, "error": str(e)[:200]}


def sitemap_urls():
    idx = fetch(MAIN + "/sitemap.xml")
    out, files = [], []
    for loc in re.findall(r"<loc>([^<]+)</loc>", idx["body"].decode("utf-8", "replace")):
        r = fetch(loc)
        urls = re.findall(r"<loc>([^<]+)</loc>", r["body"].decode("utf-8", "replace"))
        files.append({"file": loc.rsplit("/", 1)[-1], "status": r["status"], "urls": len(urls)})
        out += urls
    return files, out


def staff_main(page_html):
    rows = set(re.findall(r'href="/staff/([a-z0-9-]+)/([a-z0-9-]+)/"\s+title="([^"]+)"', page_html))
    sections = dict(re.findall(r'href="/staff/([a-z0-9-]+)/"\s+title="([^"]+)"', page_html))
    staff = {}
    for sec, code, name in rows:
        name = html.unescape(name).strip()
        d = staff.setdefault(code, {"name": name, "url": f"/staff/{sec}/{code}/", "sections": []})
        d["sections"].append(sections.get(sec, sec))
    return sorted(staff.values(), key=lambda x: x["name"])


def staff_landing(page_html):
    names = []
    for m in re.findall(r'field="li_title__\d+"[^>]*>([^<]+)<', page_html):
        n = re.sub(r"\s+", " ", html.unescape(m)).strip()
        if len(n.split()) >= 2 and "?" not in n and n not in names:
            names.append(n)
    return names


def main():
    os.makedirs(OUT, exist_ok=True)
    now = dt.datetime.now(dt.timezone(dt.timedelta(hours=3))).strftime("%Y-%m-%d %H:%M")
    health = {"checked_at": now, "sites": [], "pages": [], "redirects": [], "sitemap": {}}
    bodies = {}
    for d in SITES:
        r = fetch(f"https://{d}/")
        bodies[d] = r["body"].decode("utf-8", "replace")
        health["sites"].append({"domain": d, "status": r["status"], "ms": r["ms"], "error": r.get("error"),
                                "ssl": ssl_expiry(d), "domain_reg": whois_ru(d)})
    for p in KEY_PAGES:
        r = fetch(MAIN + p)
        health["pages"].append({"path": p, "status": r["status"], "ms": r["ms"]})
    for p in REDIRECTS:
        r = fetch(MAIN + p, follow=False)
        health["redirects"].append({"path": p, "status": r["status"], "to": r["location"]})
    files, urls = sitemap_urls()
    staff_like = [u.replace(MAIN, "") for u in urls if "/staff/" in u or "/price/" in u]
    health["sitemap"] = {"files": files, "total": len(urls)}

    staff = {"checked_at": now, "main": staff_main(bodies.get("empathycenter.ru", "")),
             "landing": staff_landing(bodies.get("psychiatrist-online.ru", "")),
             "sitemap_staff_urls": sorted(set(staff_like))}
    # переадресации из sitemap не должны вести на уволенных: отметим адреса, которые есть в REDIRECTS
    health["sitemap"]["fired_in_sitemap"] = [u for u in staff["sitemap_staff_urls"] if u in REDIRECTS]

    json.dump(health, open(os.path.join(OUT, "health.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    json.dump(staff, open(os.path.join(OUT, "staff.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("ok", now, "main staff:", len(staff["main"]), "landing:", len(staff["landing"]),
          "sitemap urls:", len(urls), "staff urls:", len(staff_like))
    bad = [s for s in health["sites"] if s["status"] != 200]
    if bad:
        print("WARN sites down:", [(s["domain"], s["status"], s.get("error")) for s in bad], file=sys.stderr)


if __name__ == "__main__":
    main()
