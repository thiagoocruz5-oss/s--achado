import http.server
import json
import urllib.request
import urllib.parse
import subprocess
import threading
import re
import os
import html
import ssl

PORT = 3000
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_JSON_PATH = os.path.join(BASE_DIR, "data", "products.json")
DATA_SEED_PATH = os.path.join(BASE_DIR, "data", "products-seed.js")

ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE


def find_browser_executable():
    candidates = [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    ]
    for path in candidates:
        if os.path.exists(path):
            return path
    return None


def parse_brl_number(val_str):
    if not val_str:
        return 0.0
    s = re.sub(r"[^\d.,]", "", str(val_str)).strip()
    if not s:
        return 0.0
    if "." in s and "," in s:
        s = s.replace(".", "").replace(",", ".")
    elif "," in s:
        s = s.replace(",", ".")
    try:
        return float(s)
    except Exception:
        return 0.0


def parse_dom_for_ml(page_html, result):
    if not page_html:
        return

    # 0. Check for Mercado Livre Affiliate Social Landing ("card-featured" polycard JSON)
    # This is returned when opening meli.la/... or mercadolivre.com/sec/... affiliate links!
    feat_idx = page_html.find('"id":"card-featured"')
    if feat_idx != -1:
        feat_chunk = page_html[feat_idx : feat_idx + 10000]
        m_ftitle = re.search(r'"type"\s*:\s*"title".*?"text"\s*:\s*"([^"]+)"', feat_chunk)
        if m_ftitle and not result["title"]:
            result["title"] = html.unescape(m_ftitle.group(1))

        m_fcurr = re.search(r'"current_price"\s*:\s*\{\s*"value"\s*:\s*(\d+(?:\.\d+)?)', feat_chunk)
        if m_fcurr:
            result["price"] = float(m_fcurr.group(1))

        m_fprev = re.search(r'"previous_price"\s*:\s*\{\s*"value"\s*:\s*(\d+(?:\.\d+)?)', feat_chunk)
        if m_fprev:
            result["oldPrice"] = float(m_fprev.group(1))

        m_fpic = re.search(r'"pictures"\s*:\s*\[\s*\{\s*"id"\s*:\s*"([^"]+)"', feat_chunk)
        if m_fpic:
            pic_id = m_fpic.group(1)
            result["image"] = f"https://http2.mlstatic.com/D_NQ_NP_2X_{pic_id}-F.webp"

    # 1. JSON-LD (<script type="application/ld+json">)
    ld_matches = re.findall(
        r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
        page_html,
        re.DOTALL | re.IGNORECASE,
    )
    for ld_raw in ld_matches:
        try:
            ld_data = json.loads(ld_raw.strip())
            items = ld_data if isinstance(ld_data, list) else [ld_data]
            if isinstance(ld_data, dict) and "@graph" in ld_data:
                items.extend(ld_data["@graph"])
            for item in items:
                if not isinstance(item, dict):
                    continue
                if item.get("name") and item.get("offers"):
                    if not result["title"]:
                        result["title"] = html.unescape(str(item["name"]))
                    img = item.get("image")
                    if not result["image"]:
                        if isinstance(img, list) and img:
                            result["image"] = img[0]
                        elif isinstance(img, str) and img:
                            result["image"] = img
                    offers = item.get("offers")
                    if isinstance(offers, list) and offers:
                        offers = offers[0]
                    if isinstance(offers, dict) and result["price"] <= 0:
                        p = offers.get("price") or offers.get("lowPrice")
                        if p and float(p) > 0:
                            result["price"] = float(p)
                    agg = item.get("aggregateRating")
                    if isinstance(agg, dict) and agg.get("ratingValue"):
                        result["rating"] = str(round(float(agg["ratingValue"]), 1))
        except Exception:
            pass

    # 2. <meta itemprop="price" content="233.60">
    if result["price"] <= 0:
        m_itemprop = re.search(
            r'<meta[^>]+itemprop=["\']price["\'][^>]+content=["\']([\d.]+)["\']',
            page_html,
            re.IGNORECASE,
        ) or re.search(
            r'<meta[^>]+content=["\']([\d.]+)["\'][^>]+itemprop=["\']price["\']',
            page_html,
            re.IGNORECASE,
        )
        if m_itemprop:
            try:
                result["price"] = float(m_itemprop.group(1))
            except Exception:
                pass

    # 3. OpenGraph Title & Image
    if not result["title"]:
        h1_m = re.search(
            r'<h1[^>]*class=["\'][^"\']*ui-pdp-title[^"\']*["\'][^>]*>(.*?)</h1>',
            page_html,
            re.DOTALL | re.IGNORECASE,
        )
        if h1_m:
            result["title"] = html.unescape(re.sub(r"<[^>]+>", "", h1_m.group(1)).strip())
        else:
            m_title = re.search(
                r'<meta[^>]+property=["\']og:title["\'][^>]+content=["\']([^"\']+)["\']',
                page_html,
                re.IGNORECASE,
            ) or re.search(
                r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:title["\']',
                page_html,
                re.IGNORECASE,
            )
            if m_title:
                t_cand = m_title.group(1).strip()
                if t_cand.lower() not in ("mercado livre", "mercado libre") and "perfil social" not in t_cand.lower():
                    result["title"] = html.unescape(t_cand)

    if not result["image"] or "logo__small" in result["image"] or "pt_logo" in result["image"]:
        m_img = re.search(
            r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']',
            page_html,
            re.IGNORECASE,
        ) or re.search(
            r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image["\']',
            page_html,
            re.IGNORECASE,
        )
        if m_img and "logo" not in m_img.group(1):
            result["image"] = html.unescape(m_img.group(1))

    # 4. JSON price / original_price in hydration state
    if result["price"] <= 0:
        m_json_p = re.search(r'"price"\s*:\s*(\d+(?:\.\d{1,2})?)', page_html)
        if m_json_p:
            result["price"] = float(m_json_p.group(1))

    if result["oldPrice"] <= 0:
        m_orig = re.search(r'"original_price"\s*:\s*(\d+(?:\.\d{1,2})?)', page_html)
        if m_orig:
            try:
                orig_val = float(m_orig.group(1))
                if orig_val > result["price"]:
                    result["oldPrice"] = orig_val
            except Exception:
                pass

    # 5. DOM fallback for original price
    if result["oldPrice"] <= 0:
        m_dom_orig = re.search(
            r'ui-pdp-price__original-value.*?andes-money-amount__fraction[^>]*>([\d.]+)<',
            page_html,
            re.DOTALL | re.IGNORECASE,
        )
        if m_dom_orig:
            val = parse_brl_number(m_dom_orig.group(1))
            if val > result["price"]:
                result["oldPrice"] = val


def extract_ml_metadata(target_url):
    result = {
        "title": "",
        "price": 0.0,
        "oldPrice": 0.0,
        "image": "",
        "rating": "4.8",
        "resolvedUrl": target_url,
    }

    # Step 1A: Fast curl with Chrome User-Agent.
    # For affiliate links (meli.la / mercadolivre.com/sec), this follows the redirect to /social/...
    # and extracts the featured product's title, high-res image, current price and old price in ~0.5s!
    try:
        p_chrome_curl = subprocess.run(
            [
                "curl.exe",
                "-s",
                "-L",
                "-A",
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "-w",
                "\n__FINAL_URL__:%{url_effective}",
                target_url,
            ],
            capture_output=True,
            timeout=10,
        )
        out_c = p_chrome_curl.stdout.decode("utf-8", errors="ignore")
        if "__FINAL_URL__:" in out_c:
            parts = out_c.rsplit("__FINAL_URL__:", 1)
            html_c = parts[0]
            eff_url = parts[1].strip()
            if eff_url and "registration?" not in eff_url and "account-verification" not in eff_url:
                result["resolvedUrl"] = eff_url
        else:
            html_c = out_c

        parse_dom_for_ml(html_c, result)
    except Exception:
        pass

    # Step 1B: If title or image is still missing (e.g. standard product link), curl with WhatsApp UA
    if not result["title"] or not result["image"]:
        try:
            p_wa = subprocess.run(
                [
                    "curl.exe",
                    "-s",
                    "-L",
                    "-A",
                    "WhatsApp/2.24.1.78 A",
                    "-w",
                    "\n__FINAL_URL__:%{url_effective}",
                    target_url,
                ],
                capture_output=True,
                timeout=8,
            )
            wa_out = p_wa.stdout.decode("utf-8", errors="ignore")
            if "__FINAL_URL__:" in wa_out:
                parts = wa_out.rsplit("__FINAL_URL__:", 1)
                wa_html = parts[0]
                eff_url = parts[1].strip()
                if eff_url and "registration?" not in eff_url and "account-verification" not in eff_url:
                    result["resolvedUrl"] = eff_url
            else:
                wa_html = wa_out

            m_canon = re.search(r'<link[^>]+rel=["\']canonical["\'][^>]+href=["\']([^"\']+)["\']', wa_html, re.I)
            if m_canon:
                result["resolvedUrl"] = html.unescape(m_canon.group(1))

            parse_dom_for_ml(wa_html, result)
        except Exception:
            pass

    # Step 2: If price is still 0 (for standard non-affiliate product links), use headless Chrome/Edge
    if result["price"] <= 0:
        browser_exe = find_browser_executable()
        if browser_exe:
            url_to_open = result["resolvedUrl"] or target_url
            try:
                p_dom = subprocess.run(
                    [
                        browser_exe,
                        "--headless=new",
                        "--disable-gpu",
                        "--no-first-run",
                        "--no-default-browser-check",
                        "--user-agent=WhatsApp/2.24.1.78 A",
                        "--virtual-time-budget=9500",
                        "--dump-dom",
                        url_to_open,
                    ],
                    capture_output=True,
                    timeout=18,
                )
                dom_html = p_dom.stdout.decode("utf-8", errors="ignore")
                parse_dom_for_ml(dom_html, result)
            except Exception:
                pass

    # Clean up title
    if result["title"]:
        result["title"] = re.sub(r"\s*\|\s*Mercado\s*Livre.*$", "", result["title"], flags=re.I)
        result["title"] = re.sub(r"\s*-\s*R\$\s*[\d.,]+.*$", "", result["title"], flags=re.I).strip()

    return result


class SoAchadoHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def log_message(self, format, *args):
        try:
            super().log_message(format, *args)
        except Exception:
            pass

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/products":
            self.handle_get_products()
        elif parsed.path == "/api/extract":
            self.handle_extract(parsed.query)
        else:
            super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/products":
            self.handle_save_products()
        elif parsed.path == "/api/publish":
            self.handle_publish_to_vercel()
        else:
            self.send_error(404, "Endpoint nao encontrado")

    def handle_publish_to_vercel(self):
        try:
            subprocess.run(["git", "add", "-A"], cwd=BASE_DIR, capture_output=True)
            subprocess.run(
                ["git", "commit", "-m", "Atualizacao de produtos So Achado"],
                cwd=BASE_DIR,
                capture_output=True,
            )
            push_res = subprocess.run(["git", "push"], cwd=BASE_DIR, capture_output=True, timeout=25)
            if push_res.returncode == 0:
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"ok": True}).encode("utf-8"))
            else:
                err_msg = push_res.stderr.decode("utf-8", errors="ignore").strip()
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(
                    json.dumps(
                        {
                            "ok": False,
                            "error": "Repositorio Git ainda nao conectado ao GitHub remoto. Conecte o GitHub uma vez para publicar com 1 clique! Detalhe: "
                            + err_msg,
                        },
                        ensure_ascii=False,
                    ).encode("utf-8")
                )
        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps({"ok": False, "error": str(e)}).encode("utf-8"))

    def handle_get_products(self):
        try:
            content = None
            try:
                ptr_req = urllib.request.Request(
                    "https://api.restful-api.dev/objects/ff808181a09d98f701a16490e8ad5ca9",
                    headers={"User-Agent": "SoAchado/1.0"},
                )
                ptr_json = json.loads(urllib.request.urlopen(ptr_req, context=ssl_ctx, timeout=5).read().decode("utf-8"))
                key = (ptr_json.get("data") or {}).get("key")
                if key:
                    bin_req = urllib.request.Request(
                        f"https://bytebin.lucko.me/{key}",
                        headers={"User-Agent": "SoAchado/1.0"},
                    )
                    cloud_str = urllib.request.urlopen(bin_req, context=ssl_ctx, timeout=5).read().decode("utf-8")
                    cloud_obj = json.loads(cloud_str)
                    if isinstance(cloud_obj, dict) and "products" in cloud_obj:
                        content = json.dumps(cloud_obj, ensure_ascii=False, indent=2)
                        with open(DATA_JSON_PATH, "w", encoding="utf-8") as f:
                            f.write(content)
            except Exception:
                pass

            if not content:
                with open(DATA_JSON_PATH, "r", encoding="utf-8") as f:
                    content = f.read()

            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(content.encode("utf-8"))
        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))

    def handle_save_products(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length).decode("utf-8")
            data = json.loads(body)

            os.makedirs(os.path.dirname(DATA_JSON_PATH), exist_ok=True)
            with open(DATA_JSON_PATH, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)

            seed_js = "window.SO_ACHADO_INITIAL_DATA = " + json.dumps(data, ensure_ascii=False, indent=2) + ";\n"
            with open(DATA_SEED_PATH, "w", encoding="utf-8") as f:
                f.write(seed_js)

            # Save directly to Cloud Store (Bytebin + Pointer) so Vercel site has it immediately!
            try:
                req1 = urllib.request.Request(
                    "https://bytebin.lucko.me/post",
                    data=json.dumps(data, ensure_ascii=False).encode("utf-8"),
                    headers={"Content-Type": "application/json", "User-Agent": "SoAchado/1.0"},
                    method="POST",
                )
                res1 = json.loads(urllib.request.urlopen(req1, context=ssl_ctx, timeout=6).read().decode("utf-8"))
                new_key = res1.get("key")
                if new_key:
                    req2 = urllib.request.Request(
                        "https://api.restful-api.dev/objects/ff808181a09d98f701a16490e8ad5ca9",
                        data=json.dumps({"name": "so_achado_store", "data": {"key": new_key}}).encode("utf-8"),
                        headers={"Content-Type": "application/json", "User-Agent": "SoAchado/1.0"},
                        method="PUT",
                    )
                    urllib.request.urlopen(req2, context=ssl_ctx, timeout=6)
            except Exception:
                pass

            # Auto-push to GitHub in background so Vercel static seed also stays updated!
            def _bg_push():
                try:
                    subprocess.run(["git", "add", "data/products.json", "data/products-seed.js"], cwd=BASE_DIR, capture_output=True)
                    subprocess.run(["git", "commit", "-m", "Atualizacao automatica de produtos"], cwd=BASE_DIR, capture_output=True)
                    subprocess.run(["git", "push", "origin", "main"], cwd=BASE_DIR, capture_output=True, timeout=25)
                except Exception:
                    pass

            threading.Thread(target=_bg_push, daemon=True).start()

            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps({"ok": True}).encode("utf-8"))
        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))

    def handle_extract(self, query_str):
        params = urllib.parse.parse_qs(query_str)
        url = (params.get("url") or [""])[0].strip()
        if not url:
            self.send_response(400)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps({"error": "URL ausente"}).encode("utf-8"))
            return

        info = extract_ml_metadata(url)
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.end_headers()
        self.wfile.write(json.dumps(info, ensure_ascii=False).encode("utf-8"))


if __name__ == "__main__":
    with http.server.ThreadingHTTPServer(("127.0.0.1", PORT), SoAchadoHandler) as httpd:
        print(f"==================================================", flush=True)
        print(f" SO ACHADO rodando em: http://127.0.0.1:{PORT}", flush=True)
        print(f" Pressione Ctrl+C para encerrar.", flush=True)
        print(f"==================================================", flush=True)
        httpd.serve_forever()
