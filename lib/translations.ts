import { Language } from '@/types/farmstack'

const translations: Record<Language, Record<string, string>> = {
  en: {
    // Auth
    login: 'Login',
    username: 'Username',
    password: 'Password',
    language_toggle: 'Kannada',
    
    // Navigation
    dashboard: 'Dashboard',
    customers: 'Customers',
    suppliers: 'Suppliers',
    products: 'Products',
    sales_invoice: 'Sales Invoice',
    purchase_invoice: 'Purchase Invoice',
    tally_sync: 'Tally Sync',
    settings: 'Settings',
    analytics: 'Analytics',
    type: 'Product Types',
    accounts: 'Accounts',
    crop_purchase: 'Crop Purchase',
    entries: 'Entries',
    
    // Dashboard
    total_sales: 'Total Sales',
    total_purchases: 'Total Purchases',
    total_customers: 'Total Customers',
    low_stock: 'Low Stock Products',
    pending_sync: 'Pending Tally Sync',
    recent_sales: 'Recent Sales',
    stock_alerts: 'Stock Alerts',
    
    // Forms
    add_customer: 'Add Customer',
    edit_customer: 'Edit Customer',
    add_supplier: 'Add Supplier',
    edit_supplier: 'Edit Supplier',
    add_product: 'Add Product',
    edit_product: 'Edit Product',
    
    // Fields
    name: 'Name',
    kannada_name: 'Kannada Name',
    phone: 'Phone',
    address: 'Address',
    kannada_address: 'Kannada Address',
    gstin: 'GSTIN',
    tally_ledger_name: 'Tally Ledger Name',
    product_name: 'Product Name',
    hsn_code: 'HSN Code',
    unit: 'Unit',
    product_type: 'Product Type',
    maintain_batches: 'Maintain Batches',
    tally_stock_item: 'Tally Stock Item Name',
    
    // Buttons
    save: 'Save',
    cancel: 'Cancel',
    edit: 'Edit',
    delete: 'Delete',
    add: 'Add',
    sync: 'Sync to Tally',
    print: 'Print Bill',
    
    // Status
    connected: 'Connected',
    disconnected: 'Disconnected',
    synced: 'Synced',
    failed: 'Failed',
    pending: 'Pending',
    
    // Messages
    select_customer: 'Select Customer',
    select_supplier: 'Select Supplier',
    select_product: 'Select Product',
    no_data: 'No data available',
  },
  
  kn: {
    // Auth
    login: 'ಲಾಗಿನ್',
    username: 'ಬಳಕೆದಾರ ಹೆಸರು',
    password: 'ಪಾಸ್‌ವರ್ಡ್',
    language_toggle: 'English',
    
    // Navigation
    dashboard: 'ಡ್ಯಾಶ್‌ಬೋರ್ಡ್',
    customers: 'ಗ್ರಾಹಕರು',
    suppliers: 'ಸರಬರಾಜುದಾರರು',
    products: 'ಉತ್ಪನ್ನಗಳು',
    sales_invoice: 'ಮಾರಾಟ ಇನ್‌ವಾಯ್ಸ್',
    purchase_invoice: 'ಖರೀದಿ ಇನ್‌ವಾಯ್ಸ್',
    tally_sync: 'ಟ್ಯಾಲಿ ಸಿಂಕ್',
    settings: 'ಸೆಟ್ಟಿಂಗ್‍ಗಳು',
    analytics: 'ವಿಶ್ಲೇಷಣೆ',
    type: 'ಉತ್ಪನ್ನ ಪ್ರಕಾರ',
    accounts: 'ಖಾತೆಗಳು',
    crop_purchase: 'ಸಾಕು ಖರೀದಿ',
    entries: 'ನಮೂದುಗಳು',
    
    // Dashboard
    total_sales: 'ಒಟ್ಟು ಮಾರಾಟ',
    total_purchases: 'ಒಟ್ಟು ಖರೀದಿ',
    total_customers: 'ಒಟ್ಟು ಗ್ರಾಹಕರು',
    low_stock: 'ಕಡಿಮೆ ಸ್ಟಾಕ್ ಉತ್ಪನ್ನಗಳು',
    pending_sync: 'ಒಂದಿಗೆ ಸಿಂಕ್ ಹಾಕಲು ಬಾಕಿ',
    recent_sales: 'ಇತ್ತೀಚೆಯ ಮಾರಾಟ',
    stock_alerts: 'ಸ್ಟಾಕ್ ಎಚ್ಚರಿಕೆಗಳು',
    
    // Forms
    add_customer: 'ಗ್ರಾಹಕ ಸೇರಿಸಿ',
    edit_customer: 'ಗ್ರಾಹಕ ಸಂಪಾದಿಸಿ',
    add_supplier: 'ಸರಬರಾಜುದಾರ ಸೇರಿಸಿ',
    edit_supplier: 'ಸರಬರಾಜುದಾರ ಸಂಪಾದಿಸಿ',
    add_product: 'ಉತ್ಪನ್ನ ಸೇರಿಸಿ',
    edit_product: 'ಉತ್ಪನ್ನ ಸಂಪಾದಿಸಿ',
    
    // Fields
    name: 'ಹೆಸರು',
    kannada_name: 'ಕನ್ನಡ ಹೆಸರು',
    phone: 'ಫೋನ್',
    address: 'ಸಿದ್ಧತೆ',
    kannada_address: 'ಕನ್ನಡ ಸಿದ್ಧತೆ',
    gstin: 'ಜಿಎಸ್ಟಿಆಇ',
    tally_ledger_name: 'ಟ್ಯಾಲಿ ಲೆಡ್ಜರ್ ಹೆಸರು',
    product_name: 'ಉತ್ಪನ್ನ ಹೆಸರು',
    hsn_code: 'ಎಚ್‌ಎಸ್‌ಎನ್ ಕೋಡ್',
    unit: 'ಘಟಕ',
    product_type: 'ಉತ್ಪನ್ನ ಪ್ರಕಾರ',
    maintain_batches: 'ಬ್ಯಾಚ್‍ಗಳನ್ನು ನಿರ್ವಹಿಸಿ',
    tally_stock_item: 'ಟ್ಯಾಲಿ ಸ್ಟಾಕ್ ಐಟಂ ಹೆಸರು',
    
    // Buttons
    save: 'ಉಳಿಸಿ',
    cancel: 'ರದ್ದುಮಾಡಿ',
    edit: 'ಸಂಪಾದಿಸಿ',
    delete: 'ಅಳಿಸಿ',
    add: 'ಸೇರಿಸಿ',
    sync: 'ಟ್ಯಾಲಿಗೆ ಸಿಂಕ್ ಮಾಡಿ',
    print: 'ಬಿಲ್ ಮುದ್ರಿಸಿ',
    
    // Status
    connected: 'ಸಂಪರ್ಕಿತ',
    disconnected: 'ಸಂಪರ್ಕ ಕಡಿತ',
    synced: 'ಸಿಂಕ್ ಮಾಡಿದೆ',
    failed: 'ವಿಫಲ',
    pending: 'ಬಾಕಿ',
    
    // Messages
    select_customer: 'ಗ್ರಾಹಕ ಆಯ್ಕೆ ಮಾಡಿ',
    select_supplier: 'ಸರಬರಾಜುದಾರ ಆಯ್ಕೆ ಮಾಡಿ',
    select_product: 'ಉತ್ಪನ್ನ ಆಯ್ಕೆ ಮಾಡಿ',
    no_data: 'ಡೇಟಾ ಲಭ್ಯವಿಲ್ಲ',
  },
}

export function getTranslation(language: Language, key: string): string {
  return translations[language][key] || key
}

export default translations
