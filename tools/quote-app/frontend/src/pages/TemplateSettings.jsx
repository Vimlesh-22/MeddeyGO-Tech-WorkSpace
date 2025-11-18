import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { getAvailableTemplates, updateTemplatePreference, getCurrentUser } from '../services/api';

const TemplateSettings = () => {
  const [templates, setTemplates] = useState([]);
  const [currentTemplate, setCurrentTemplate] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchTemplates();
    fetchCurrentUser();
  }, []);

  const fetchTemplates = async () => {
    try {
      const response = await getAvailableTemplates();
      setTemplates(response.data.data);
    } catch (error) {
      console.error('Error fetching templates:', error);
      toast.error('Failed to fetch templates');
    }
  };

  const fetchCurrentUser = async () => {
    try {
      const response = await getCurrentUser();
      setCurrentTemplate(response.data.data?.defaultTemplate || 'template1');
    } catch (error) {
      setCurrentTemplate('template1');
    } finally {
      setLoading(false);
    }
  };

  const handleTemplateChange = async (templateId) => {
    setSaving(true);
    try {
      await updateTemplatePreference(templateId);
      setCurrentTemplate(templateId);
      toast.success('Template preference updated successfully!');
    } catch (error) {
      console.error('Error updating template:', error);
      toast.error('Failed to update template preference');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading template settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Template Settings</h1>
          <p className="mt-2 text-gray-600">
            Choose your default PDF template for quotations. This template will be used when generating PDFs unless you specify otherwise.
          </p>
        </div>

        {/* Current Selection */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Current Default Template</h2>
          <div className="flex items-center space-x-3">
            <div className="flex-shrink-0">
              <div className="w-3 h-3 bg-green-500 rounded-full"></div>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">
                {templates.find(t => t.id === currentTemplate)?.name || 'Classic Template'}
              </p>
              <p className="text-sm text-gray-500">
                {templates.find(t => t.id === currentTemplate)?.description || 'Clean and professional design'}
              </p>
            </div>
          </div>
        </div>

        {/* Template Selection */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Available Templates</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {templates.map((template) => (
              <div
                key={template.id}
                className={`relative border-2 rounded-lg p-6 cursor-pointer transition-all duration-200 ${
                  currentTemplate === template.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300 hover:shadow-md'
                }`}
                onClick={() => handleTemplateChange(template.id)}
              >
                {/* Selection Indicator */}
                {currentTemplate === template.id && (
                  <div className="absolute top-4 right-4">
                    <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </div>
                )}

                {/* Template Preview */}
                <div className="mb-4">
                  <div className={`w-full h-32 rounded-lg border-2 border-dashed flex items-center justify-center ${
                    template.id === 'template1' 
                      ? 'bg-blue-50 border-blue-200' 
                      : 'bg-red-50 border-red-200'
                  }`}>
                    <div className="text-center">
                      <div className={`w-12 h-12 mx-auto mb-2 rounded-lg flex items-center justify-center ${
                        template.id === 'template1' 
                          ? 'bg-blue-500' 
                          : 'bg-red-500'
                      }`}>
                        <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <p className={`text-sm font-medium ${
                        template.id === 'template1' ? 'text-blue-700' : 'text-red-700'
                      }`}>
                        {template.name}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Template Info */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    {template.name}
                  </h3>
                  <p className="text-sm text-gray-600 mb-4">
                    {template.description}
                  </p>
                  
                  {/* Template Features */}
                  <div className="space-y-2">
                    {template.id === 'template1' ? (
                      <>
                        <div className="flex items-center text-sm text-gray-600">
                          <svg className="w-4 h-4 text-blue-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                          Blue color scheme
                        </div>
                        <div className="flex items-center text-sm text-gray-600">
                          <svg className="w-4 h-4 text-blue-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                          Clean layout
                        </div>
                        <div className="flex items-center text-sm text-gray-600">
                          <svg className="w-4 h-4 text-blue-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                          Professional design
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center text-sm text-gray-600">
                          <svg className="w-4 h-4 text-red-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                          Red color scheme
                        </div>
                        <div className="flex items-center text-sm text-gray-600">
                          <svg className="w-4 h-4 text-red-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                          Modern layout
                        </div>
                        <div className="flex items-center text-sm text-gray-600">
                          <svg className="w-4 h-4 text-red-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                          Enhanced features
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Select Button */}
                <div className="mt-6">
                  <button
                    onClick={() => handleTemplateChange(template.id)}
                    disabled={saving || currentTemplate === template.id}
                    className={`w-full py-2 px-4 rounded-lg font-medium transition-colors duration-200 ${
                      currentTemplate === template.id
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : template.id === 'template1'
                        ? 'bg-blue-500 hover:bg-blue-600 text-white'
                        : 'bg-red-500 hover:bg-red-600 text-white'
                    }`}
                  >
                    {saving ? (
                      <div className="flex items-center justify-center">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Saving...
                      </div>
                    ) : currentTemplate === template.id ? (
                      'Selected'
                    ) : (
                      'Select Template'
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Help Section */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-blue-800">How Template Selection Works</h3>
              <div className="mt-2 text-sm text-blue-700">
                <ul className="list-disc list-inside space-y-1">
                  <li>Your selected template will be used as the default for all new PDF generations</li>
                  <li>You can still override the template for individual quotations by specifying the template parameter</li>
                  <li>Template changes take effect immediately for new quotations</li>
                  <li>Existing quotations will continue to use the template they were created with</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TemplateSettings;
