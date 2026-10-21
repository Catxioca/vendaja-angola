// ============================================================================
// Cliente C# (.NET 8.0) para API Corporativa VendaJá Angola ERP
// ============================================================================
using System;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;

namespace VendaJa.Enterprise.Sdk
{
    public class VendaJaClient
    {
        private readonly HttpClient _httpClient;
        private readonly string _baseUrl;
        private readonly string _apiKey;
        private readonly string _companyId;

        public VendaJaClient(string baseUrl, string apiKey, string companyId = null)
        {
            _baseUrl = baseUrl.TrimEnd('/');
            _apiKey = apiKey;
            _companyId = companyId;
            _httpClient = new HttpClient();
            _httpClient.DefaultRequestHeaders.Add("x-api-key", _apiKey);
            if (!string.IsNullOrEmpty(_companyId))
            {
                _httpClient.DefaultRequestHeaders.Add("x-company-id", _companyId);
            }
        }

        public async Task<string> GetCustomersAsync(int page = 1, int limit = 20)
        {
            var response = await _httpClient.GetAsync($"{_baseUrl}/customers?page={page}&limit={limit}");
            response.EnsureSuccessStatusCode();
            return await response.Content.ReadAsStringAsync();
        }

        public async Task<string> CreateCustomerAsync(string name, string nif, string email = null)
        {
            var payload = new { name, nif, email };
            var content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");
            var response = await _httpClient.PostAsync($"{_baseUrl}/customers", content);
            response.EnsureSuccessStatusCode();
            return await response.Content.ReadAsStringAsync();
        }

        public static bool VerifyWebhookSignature(string payload, string signature, string secret)
        {
            using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
            var hash = hmac.ComputeHash(Encoding.UTF8.GetBytes(payload));
            var expectedSignature = BitConverter.ToString(hash).Replace("-", "").ToLowerInvariant();
            return string.Equals(signature, expectedSignature, StringComparison.OrdinalIgnoreCase);
        }
    }
}
