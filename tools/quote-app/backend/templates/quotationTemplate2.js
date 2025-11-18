const generateHTML = (quotation, logoBase64, footerABase64, footerBBase64) => {
    // Format date
    const formatDate = (date) => new Date(date).toLocaleDateString('en-IN');
  
    // Generate table rows for products
    const products = quotation.products.map(product => {
      const priceWithGST = product.sellingPrice * (1 + (product.gstPercentage / 100));
      const totalAmount = priceWithGST * product.quantity;
      
      // Validate image URL
      const isValidImageUrl = product.imageUrl && 
                             product.imageUrl.trim() !== '' && 
                             product.imageUrl !== 'undefined' && 
                             product.imageUrl !== 'null' &&
                             (product.imageUrl.startsWith('http') || product.imageUrl.startsWith('data:'));
      
      return `
          <tr>
              <td>
                  <div class="product-image">
                      ${isValidImageUrl ? 
                          `<img src="${product.imageUrl}" alt="${product.name}" loading="eager" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display='none'; this.parentElement.textContent='${product.name.charAt(0).toUpperCase()}';">` : 
                          product.name.charAt(0).toUpperCase()
                      }
                  </div>
              </td>
              <td>
                  <div style="max-width: 200px; overflow-wrap: break-word;">
                      ${product.name}
                  </div>
              </td>
              <td style="text-align: center">${product.quantity}</td>
              <td style="text-align: right">₹${priceWithGST.toFixed(2)}</td>
              <td style="text-align: right">₹${totalAmount.toFixed(2)}</td>
          </tr>
      `;
    }).join('');
  
    // Calculate totals
    const calculateTotals = (products) => {
      return products.reduce((acc, product) => {
          const priceWithGST = product.sellingPrice * (1 + (product.gstPercentage / 100));
          const totalAmount = priceWithGST * product.quantity;
          
          acc.subTotal += product.sellingPrice * product.quantity;
          acc.gstTotal += (priceWithGST - product.sellingPrice) * product.quantity;
          acc.grandTotal += totalAmount;
          
          return acc;
      }, { subTotal: 0, gstTotal: 0, grandTotal: 0 });
    };
  
    const { subTotal, gstTotal, grandTotal } = calculateTotals(quotation.products);
  
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Meddey Technologies - Quote ${quotation.quotationNumber}</title>
          
          <!-- Preload product images for better PDF generation -->
          ${quotation.products.map(product => {
              if (product.imageUrl && 
                  product.imageUrl.trim() !== '' && 
                  product.imageUrl !== 'undefined' && 
                  product.imageUrl !== 'null' &&
                  (product.imageUrl.startsWith('http') || product.imageUrl.startsWith('data:'))) {
                  return `<link rel="preload" as="image" href="${product.imageUrl}">`;
              }
              return '';
          }).join('')}
          <style>
          :root {
              --primary: #0d6efd;
              --primary-dark: #0b5ed7;
              --primary-light: #e6f0ff;
              --accent: #08120f;
              --dark: #212529;
              --gray: #6c757d;
              --light: #f8f9fa;
              --border: #dee2e6;
              --success: #198754;
              --radius: 12px;
              --shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
          }
          
          * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
              font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
          }
          
          body {
              background: white;
              min-height: 29.7cm;
              width: 21cm;
              margin: 0 auto;
              padding: 0;  /* Changed from 0.5cm to 0 */
              color: var(--dark);
              line-height: 1.6;
          }
          
          .container {
              width: 100%;
              background: white;
              overflow: hidden;
              position: relative;
              padding: 0;  /* Add this line */
          }
          
          .watermark {
              position: absolute;
              top: 50%;
              left: 50%;
              transform: translate(-50%, -50%) rotate(-45deg);
              font-size: 120px;
              font-weight: 900;
              color: rgba(13, 110, 253, 0.03);
              pointer-events: none;
              z-index: 0;
              opacity: 0.5;
          }
          
          /* Header Section */
          .header {
              text-align: center;
              padding: 15px 20px;
              color: black;
              position: relative;
              z-index: 1;
              border-bottom: 1px solid #dee2e6;
              margin-bottom: 15px;
              border-radius: 12px;
          }
          
          .header-top {
              display: block;  /* Changed from flex to block */
              text-align: center;
          }
          
          .logo-container {
              display: none;  /* Hide logo */
          }
          
          .company-details {
              width: 100%;
              text-align: center;
              margin-top: 0;  /* Changed from 5px to 0 */
          }
          
          .company-name {
              font-size: 24px;
              font-weight: 700;
              margin-bottom: 8px;  /* Keep this margin for spacing between elements */
              letter-spacing: 0.5px;
              color: black;
          }
          
          .company-address, .gst-info, .contact-info {
              font-size: 12px;
              line-height: 1.4;
              opacity: 1;
              margin-bottom: 6px;
              color: #212529;
          }
          
          .contact-info {
              margin-top: 8px;
              font-weight: 500;
          }
          
          /* Remove quote header section */
          .quote-header,
          .quote-left,
          .quote-right,
          .quote-title,
          .quote-info,
          .quote-info-item,
          .info-label,
          .info-value {
              display: none;
          }
          
          /* Content Section */
          .content {
              padding: 20px;
              position: relative;
              z-index: 1;
          }
          
          .bill-to {
              display: grid;
              grid-template-columns: 1fr 1fr; /* Two equal columns */
              gap: 20px;
              margin-bottom: 20px;
          }
          
          .section {
              background: var(--light);
              padding: 8px;  /* Reduced from 12px */
              margin-bottom: 10px;  /* Reduced from 12px */
              border-radius: 8px;
              border-left: 4px solid var(--primary);
              box-shadow: 0 4px 12px rgba(0,0,0,0.03);
          }
          
          .section-title {
              font-size: 16px;  /* Reduced from 18px */
              font-weight: 700;
              color: var(--primary);
              margin-bottom: 8px;  /* Reduced from 15px */
              display: flex;
              align-items: center;
              gap: 8px;  /* Reduced from 10px */
          }
          
          .customer-name {
              font-size: 16px;
              font-weight: 600;
              margin-bottom: 10px;
              color: var(--dark);
          }
          
          .customer-address {
              font-size: 13px;
              line-height: 1.5;
              color: var(--gray);
          }
          
          .quote-details-grid {
              display: grid;
              grid-template-columns: repeat(2, 1fr);
              gap: 10px;  /* Reduced from 15px */
              margin-top: 10px;  /* Reduced from 15px */
          }
          
          .detail-item {
              padding: 8px 12px;  /* Reduced from 10px 15px */
              background: rgba(255, 255, 255, 0.3);
              border-radius: 6px;
          }
          
          .detail-label {
              font-size: 13px;
              font-weight: 500;
              opacity: 0.9;
              margin-bottom: 3px;
          }
          
          .detail-value {
              font-size: 16px;
              font-weight: 600;
          }
          
          .table-container {
              overflow-x: auto;
              margin: 15px 0;
              border-radius: var(--radius);
              box-shadow: 0 4px 12px rgba(0,0,0,0.05);
          }
          
          .items-table {
              width: 100%;
              border-collapse: collapse; /* Changed from separate */
              font-size: 12px;
              background: white;
          }
          
          .items-table th {
              padding: 8px;
              white-space: nowrap;
              border: 1px solid var(--border);
              background: var(--light);
          }
          
          .items-table td {
              padding: 15px;
              vertical-align: middle;
              word-break: break-word;
              height: 80px;
              border: 1px solid var(--border);
          }
          
          /* Add max-width for description column */
          .items-table td:nth-child(2) {
              max-width: 200px;
          }
          
          /* Update font sizes for better readability */
          .company-name {
              font-size: 24px;
          }
          
          .company-address, .gst-info, .contact-info {
              font-size: 12px;
              line-height: 1.4;
          }
          
          .quote-title {
              font-size: 28px;
          }
          
          .customer-name {
              font-size: 16px;
          }
          
          .customer-address {
              font-size: 13px;
          }
          
          /* Update spacing for better layout */
          .header {
              padding: 15px 20px; /* Reduced padding */
              margin-bottom: 15px; /* Reduced margin */
          }
          
          .content {
              padding: 20px;
          }
          
          .section {
              padding: 8px;  /* Reduced from 12px */
              margin-bottom: 10px;  /* Reduced from 12px */
          }
          
          /* Add print-specific styles */
          @page {
              size: A4;
              margin: 0.5cm; /* Set print margins to 0.5cm */
          }
          
          @media print {
              body {
                  padding: 0;  /* Changed from 0.5cm to 0 */
                  -webkit-print-color-adjust: exact;
                  print-color-adjust: exact;
              }
              
              .container {
                  box-shadow: none;
              }
          }
          
  
          
          .terms {
              margin-bottom: 30px;
          }
          
          .terms-content {
              font-size: 12px;
              line-height: 1.5;
              background: var(--light);
              padding: 20px;
              border-radius: 8px;
              box-shadow: 0 4px 12px rgba(0,0,0,0.03);
          }
          
          .terms-content p {
              margin-bottom: 10px;
          }
          
          .terms-content p:last-child {
              margin-bottom: 0;
          }
          
          .totals-container {
              display: flex;
              justify-content: flex-end;
              margin-bottom: 30px;
          }
          
          .totals {
              max-width: 300px;
              margin-left: auto;
              background: var(--light);
              padding: 20px;
              border-radius: var(--radius);
              box-shadow: 0 4px 12px rgba(0,0,0,0.03);
          }
          
          .total-item {
              display: flex;
              justify-content: space-between;
              padding: 10px 0;
              border-bottom: 1px solid var(--border);
              font-size: 13px;
          }
          
          .total-label {
              font-weight: 500;
          }
          
          .total-value {
              font-weight: 600;
              min-width: 100px;
              text-align: right;
          }
          
          .total-main {
              font-size: 16px;
              color: var(--primary);
              border-bottom: none;
              padding-top: 12px;
              margin-top: 5px;
          }
          
          /* Buttons */
          .btn-container {
              display: flex;
              justify-content: center;
              gap: 20px;
              margin-top: 30px;
              padding: 0 40px 40px;
          }
          
          .btn {
              padding: 14px 35px;
              border: none;
              border-radius: 50px;
              font-weight: 600;
              cursor: pointer;
              transition: all 0.3s ease;
              display: flex;
              align-items: center;
              gap: 10px;
              font-size: 16px;
              box-shadow: 0 4px 15px rgba(0,0,0,0.1);
          }
          
          .btn-print {
              background: var(--primary);
              color: white;
          }
          
          .btn-download {
              background: var(--success);
              color: white;
          }
          
          .btn:hover {
              transform: translateY(-3px);
              box-shadow: 0 7px 20px rgba(0, 0, 0, 0.15);
          }
          
          .btn:active {
              transform: translateY(-1px);
          }
          
          /* Footer */
          .footer {
              padding: 15px 20px;
              font-size: 12px;
              margin-top: 20px;
              background: var(--light);
              display: flex;
              justify-content: space-between;
              flex-wrap: wrap;
              gap: 20px;
              border-top: 1px solid var(--border);
              color: var(--gray);
          }
          
          .footer-contact {
              flex: 1;
              min-width: 300px;
          }
          
          .footer-links {
              display: flex;
              gap: 15px;
          }
          
          .footer-link {
              color: var(--primary);
              text-decoration: none;
              display: flex;
              align-items: center;
              gap: 5px;
              transition: all 0.3s ease;
          }
          
          .footer-link:hover {
              color: var(--primary-dark);
              transform: translateX(3px);
          }
  
          /* Add styles for footer pages */
          .footer-page {
              width: 21cm;
              height: 29.7cm;
              margin: 0;
              padding: 0;
              page-break-before: always;
              position: relative;
          }
  
          .footer-image {
              width: 100%;
              height: 100%;
              object-fit: cover;
          }
  
          @media print {
              .footer-page {
                  page-break-before: always;
              }
          }
  
          /* Terms footer styles */
          .final-terms-footer {
              width: 21cm;
              padding: 20px;
              text-align: left;
              page-break-before: always;
              margin-top: auto;
          }
  
          .final-terms {
              margin-bottom: 30px;
              font-size: 14px;
              line-height: 1.8;
          }
  
          .final-contact {
              font-size: 14px;
              line-height: 1.8;
              color: var(--gray);
          }
          
          /* Responsive */
          @media (max-width: 768px) {
              .header {
                  padding: 25px;
              }
              
              .content {
                  padding: 25px;
              }
              
              .quote-header {
                  flex-direction: column;
                  align-items: flex-start;
                  gap: 20px;
              }
              
              .quote-info {
                  grid-template-columns: 1fr;
              }
              
              .btn {
                  padding: 12px 25px;
                  font-size: 15px;
              }
              
              .footer {
                  flex-direction: column;
              }
          }
          
          @media (max-width: 480px) {
              .header {
                  padding: 20px;
              }
              
              .content {
                  padding: 20px;
              }
              
              .btn-container {
                  flex-direction: column;
                  gap: 15px;
              }
              
              .btn {
                  width: 100%;
                  justify-content: center;
              }
          }
          
          /* Ensure images are visible and properly sized */
          .product-image {
              width: 75px;
              height: 75px;
              border-radius: 6px;
              overflow: hidden;
              background: linear-gradient(135deg, #e0e7ff 0%, #dbeafe 100%);
              display: flex;
              align-items: center;
              justify-content: center;
              color: var(--primary);
              font-weight: bold;
              position: relative;
          }
          
          .product-image img {
              width: 100%;
              height: 100%;
              object-fit: cover;
              display: block;
              max-width: 100%;
              max-height: 100%;
              position: absolute;
              top: 0;
              left: 0;
          }
          
          .product-image img[src=""] {
              display: none;
          }
          
          .product-image img:not([src]), 
          .product-image img[src="undefined"], 
          .product-image img[src="null"] {
              display: none;
          }
          
      </style>
      
      <script>
          // Ensure all images are loaded before PDF generation
          window.addEventListener('load', function() {
              const images = document.querySelectorAll('img');
              let loadedCount = 0;
              const totalImages = images.length;
              
              if (totalImages === 0) return;
              
              function checkAllLoaded() {
                  loadedCount++;
                  if (loadedCount === totalImages) {
                      console.log('All images loaded successfully');
                  }
              }
              
              images.forEach(function(img) {
                  if (img.complete && img.naturalHeight !== 0) {
                      checkAllLoaded();
                  } else {
                      img.addEventListener('load', checkAllLoaded);
                      img.addEventListener('error', function() {
                          console.warn('Image failed to load:', img.src);
                          // Hide failed image and show fallback
                          img.style.display = 'none';
                          if (img.parentElement) {
                              img.parentElement.textContent = img.alt ? img.alt.charAt(0).toUpperCase() : '?';
                          }
                          checkAllLoaded();
                      });
                  }
              });
              
              // Fallback timeout to ensure we don't wait forever
              setTimeout(function() {
                  if (loadedCount < totalImages) {
                      console.warn('Image loading timeout, proceeding with PDF generation');
                  }
              }, 10000);
          });
      </script>
      </head>
      <body>
          <!-- Main content -->
          <div class="container">
              <div class="watermark">MEDDEY</div>
              
              <div class="header">
                  <div class="header-top">
                      <div class="logo-container">
                          ${logoBase64 ? 
                            `<img src="data:image/png;base64,${logoBase64}" alt="Meddey Logo" class="logo">` :
                            `<img src="https://meddey.com/cdn/shop/files/Meddey_1_a9e7c93d-6b1b-4d73-b4cb-bb110a73204f.png" alt="Meddey Logo" class="logo">`
                          }
                      </div>
                      <div class="company-details">
                          <div class="company-name">Meddey Technologies Pvt Ltd.</div>
                          <div class="company-address">C-75, First Floor, Industrial Area, Phase 1, Okhla, New Delhi-110020 INDIA</div>
                          <div class="gst-info">GST No: 07AAKCM6565B2ZD</div>
                          <div class="contact-info">
                              <i class="fas fa-phone-alt"></i> 8586012345 | 
                              <i class="fas fa-id-card"></i> MD 42: RMD/DCD/HO-1788/3315
                          </div>
                      </div>
                  </div>
              </div>
              
              <div class="content">
                  <div class="bill-to">
                      <div class="section">
                          <div class="section-title">
                              <i class="fas fa-user"></i> Customer Details
                          </div>
                          <div class="customer-info">
                              <div class="customer-name">${quotation.clientName}</div>
                              <div class="customer-address">
                                  ${quotation.clientAddress ? quotation.clientAddress + '<br>' : ''}
                                  <i class="fas fa-envelope"></i> ${quotation.clientEmail}<br>
                                  ${quotation.clientPhone ? `<i class="fas fa-phone"></i> ${quotation.clientPhone}` : ''}
                              </div>
                          </div>
                      </div>
                      
                      <div class="section">
                          <div class="section-title">
                              <i class="fas fa-file-invoice"></i> Quote Ref
                          </div>
                          <div class="quote-details-grid">
                              <div class="detail-item">
                                  <div class="detail-label">QUOTE #</div>
                                  <div class="detail-value">${quotation.quotationNumber}</div>
                              </div>
                              <div class="detail-item">
                                  <div class="detail-label">STAGE</div>
                                  <div class="detail-value">${quotation.stage}</div>
                              </div>
                              <div class="detail-item">
                                  <div class="detail-label">ASSIGNED TO</div>
                                  <div class="detail-value">${quotation.assignedUser ? quotation.assignedUser.name : 'Not Assigned'}</div>
                              </div>
                              <div class="detail-item">
                                  <div class="detail-label">VALID UNTIL</div>
                                  <div class="detail-value">${formatDate(quotation.validUntil)}</div>
                              </div>
                          </div>
                      </div>
                  </div>
                  
                  <div class="table-container">
                      <table class="items-table">
                          <thead>
                              <tr>
                                  <th>IMAGE</th>
                                  <th>DESCRIPTION</th>
                                  <th>Quantites</th>
                                  <th>UNIT PRICE</th>
                                  <th>TOTAL AMOUNT</th>
                              </tr>
                          </thead>
                          <tbody>
                              ${products}
                          </tbody>
                      </table>
                  </div>
                  
                  <div class="totals-container">
                      <div class="totals">
                          <div class="total-item total-main">
                              <span class="total-label">Grand Total</span>
                              <span class="total-value">₹${grandTotal.toFixed(2)}</span>
                          </div>
                      </div>
                  </div>
              </div>
          </div>
  
          <!-- Footer B Page (Second Last) -->
          ${footerBBase64 ? `
          <div class="footer-page">
              <img src="data:image/png;base64,${footerBBase64}" 
                   alt="Footer B" 
                   class="footer-image">
          </div>
          ` : ''}
  
          <!-- Footer A Page (Last) -->
          ${footerABase64 ? `
          <div class="footer-page">
              <img src="data:image/png;base64,${footerABase64}" 
                   alt="Footer A" 
                   class="footer-image">
          </div>
          ` : ''}
  
          <div class="final-terms-footer">
              <div class="final-terms">
                  <h3>Terms & Conditions</h3>
                  <p>Payment terms: 100% advance before delivery</p>
                  <p>Prices are inclusive of applicable taxes.</p>
                  <p>Prices are ${quotation.excludeTransport ? 'exclusive' : 'inclusive'} of Transportation Charges.</p>
              </div>
              
              <div class="final-contact">
                  <p>Thank you for your business! We appreciate your trust in Meddey Technologies</p>
                  <p>For any queries, contact us at support@meddey.com or call +91 85860 12345</p>
                  <p>www.meddeygo.com</p>
              </div>
          </div>
      </body>
      </html>
    `;
  };
  
  module.exports = generateHTML;