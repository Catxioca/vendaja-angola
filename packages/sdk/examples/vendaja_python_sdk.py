"""
Cliente Python Oficial para a API Corporativa do VendaJá Angola ERP
Compatível com Python 3.9+ (requests / urllib)
"""
import hmac
import hashlib
import json
import urllib.request
import urllib.error

class VendaJaClient:
    def __init__(self, base_url: str, api_key: str = None, company_id: str = None):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.company_id = company_id

    def _headers(self):
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json"
        }
        if self.api_key:
            headers["x-api-key"] = self.api_key
        if self.company_id:
            headers["x-company-id"] = self.company_id
        return headers

    def _request(self, method: str, path: str, payload: dict = None):
        url = f"{self.base_url}{path}"
        data = json.dumps(payload).encode("utf-8") if payload else None
        req = urllib.request.Request(url, data=data, headers=self._headers(), method=method)
        try:
            with urllib.request.urlopen(req) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            error_body = e.read().decode("utf-8")
            raise Exception(f"HTTP {e.code}: {error_body}")

    def list_customers(self, page=1, limit=20):
        return self._request("GET", f"/customers?page={page}&limit={limit}")

    def create_customer(self, name: str, nif: str, email: str = None, phone: str = None):
        return self._request("POST", "/customers", {
            "name": name,
            "nif": nif,
            "email": email,
            "phone": phone
        })

    def get_sales_analytics(self, since: str = None):
        query = f"?since={since}" if since else ""
        return self._request("GET", f"/integrations/bi/sales{query}")

    @staticmethod
    def verify_webhook_signature(payload_str: str, signature: str, secret: str) -> bool:
        expected = hmac.new(secret.encode("utf-8"), payload_str.encode("utf-8"), hashlib.sha256).hexdigest()
        return hmac.compare_digest(signature, expected)

if __name__ == "__main__":
    client = VendaJaClient("http://localhost:4000/api/v1", api_key="vj_live_demo123456789")
    print("VendaJá Python SDK carregado com sucesso.")
