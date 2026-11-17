Pod::Spec.new do |s|
  s.name           = 'VirgoFileRange'
  s.version        = '1.0.0'
  s.summary        = 'Copies a byte range of a file to another file, off the JavaScript thread.'
  s.description    = 'Cuts a large upload into parts natively, so no byte of it passes through JavaScript.'
  s.license        = 'UNLICENSED'
  s.author         = 'Virgo'
  s.homepage       = 'https://virgo.ph'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,swift}"
end
